import type { IncomingMessage, ServerResponse } from 'http';
import {
  createUserSession,
  getUserByToken,
  destroyUserSession,
  getUserMemories,
  getOrCreateUserByPhone,
  findUserByPhone,
  calculateAge,
  type ProfileRecord,
} from './db.ts';
import { validateIndianPhone } from './phoneUtils.ts';
import { getSupabase, sendPhoneOtp, verifyPhoneOtp } from './supabaseClient.ts';

// In-memory cache for pending signup requests awaiting OTP verification
interface PendingRegistration {
  phone: string;
  fullName: string;
  dob: string;
  address: string;
  occupation: string;
  gender: string;
  timestamp: number;
}

const pendingRegistrations = new Map<string, PendingRegistration>();

// In-memory OTP rate limiter (last requested timestamp)
const otpCooldowns = new Map<string, number>();
const OTP_COOLDOWN_SECONDS = 30;

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    if ((req as any).body && typeof (req as any).body === 'object') {
      return resolve((req as any).body);
    }
    if ((req as any).body && typeof (req as any).body === 'string') {
      try {
        return resolve(JSON.parse((req as any).body));
      } catch {
        return resolve({});
      }
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });

    req.on('end', () => {
      const bodyStr = Buffer.concat(chunks).toString('utf-8');
      try {
        const parsed = JSON.parse(bodyStr || '{}');
        resolve(parsed);
      } catch {
        resolve({});
      }
    });

    req.on('error', () => {
      resolve({});
    });
  });
}

export function extractAuthToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const customToken = req.headers['x-auth-token'];
  if (typeof customToken === 'string') {
    return customToken.trim();
  }

  return null;
}

export async function handleAuthRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '';
  const method = req.method?.toUpperCase();

  // GET /api/auth/status -> checks configuration of Supabase
  if (method === 'GET' && url.startsWith('/api/auth/status')) {
    const supabase = getSupabase();
    return sendJson(res, 200, {
      success: true,
      configured: !!supabase,
      hasSupabaseUrl: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      provider: 'supabase',
    });
  }

  // POST /api/auth/otp/send
  if (method === 'POST' && url.startsWith('/api/auth/otp/send')) {
    try {
      const body = await readRequestBody(req);
      const {
        phone,
        mode = 'login',
        full_name,
        date_of_birth,
        address,
        occupation_status,
        gender,
      } = body;

      // 1. Validate Phone Number
      const phoneValidation = validateIndianPhone(phone);
      if (!phoneValidation.valid || !phoneValidation.normalized) {
        return sendJson(res, 400, {
          success: false,
          error: phoneValidation.error || 'Please enter a valid 10-digit Indian phone number.',
        });
      }

      const normalizedPhone = phoneValidation.normalized;
      const displayPhone = phoneValidation.display || normalizedPhone;

      // 2. Cooldown check
      const lastSent = otpCooldowns.get(normalizedPhone);
      const now = Date.now();
      if (lastSent && now - lastSent < OTP_COOLDOWN_SECONDS * 1000) {
        const remaining = Math.ceil((OTP_COOLDOWN_SECONDS * 1000 - (now - lastSent)) / 1000);
        return sendJson(res, 429, {
          success: false,
          error: `Please wait ${remaining} seconds before requesting a new OTP.`,
          cooldownRemaining: remaining,
        });
      }

      // 3. Mode validations
      if (mode === 'signup') {
        if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
          return sendJson(res, 400, {
            success: false,
            error: 'Full Name is required (at least 2 characters).',
          });
        }

        if (!date_of_birth || typeof date_of_birth !== 'string') {
          return sendJson(res, 400, {
            success: false,
            error: 'Date of Birth is required (YYYY-MM-DD).',
          });
        }

        const birthDate = new Date(date_of_birth);
        if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
          return sendJson(res, 400, {
            success: false,
            error: 'Please enter a valid past Date of Birth.',
          });
        }

        // Cache registration details pending OTP verification
        pendingRegistrations.set(normalizedPhone, {
          phone: normalizedPhone,
          fullName: full_name.trim(),
          dob: date_of_birth.trim(),
          address: (address || '').trim(),
          occupation: (occupation_status || 'Explorer').trim(),
          gender: gender || 'unspecified',
          timestamp: now,
        });
      }

      // 4. Send real OTP via Supabase
      const otpResult = await sendPhoneOtp(normalizedPhone);
      if (!otpResult.success) {
        return sendJson(res, 400, {
          success: false,
          error: otpResult.error || 'Failed to send OTP SMS.',
        });
      }

      // Record timestamp for cooldown
      otpCooldowns.set(normalizedPhone, now);

      return sendJson(res, 200, {
        success: true,
        phone: normalizedPhone,
        displayPhone,
        message: `A 6-digit verification code has been sent to ${displayPhone}.`,
      });
    } catch (err: any) {
      console.error('OTP Send error:', err);
      return sendJson(res, 500, {
        success: false,
        error: err.message || 'An unexpected error occurred while sending OTP.',
      });
    }
  }

  // POST /api/auth/otp/verify
  if (method === 'POST' && url.startsWith('/api/auth/otp/verify')) {
    try {
      const body = await readRequestBody(req);
      const {
        phone,
        otp,
        mode = 'login',
        full_name,
        date_of_birth,
        address,
        occupation_status,
        gender,
      } = body;

      // 1. Validate Phone
      const phoneValidation = validateIndianPhone(phone);
      if (!phoneValidation.valid || !phoneValidation.normalized) {
        return sendJson(res, 400, {
          success: false,
          error: phoneValidation.error || 'Invalid phone number.',
        });
      }

      const normalizedPhone = phoneValidation.normalized;

      // 2. Validate OTP code
      if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
        return sendJson(res, 400, {
          success: false,
          error: 'Please enter a valid 6-digit numerical verification code.',
        });
      }

      // 3. Verify OTP via Supabase Authentication
      const verifyResult = await verifyPhoneOtp(normalizedPhone, otp.trim());
      if (!verifyResult.success || !verifyResult.user) {
        return sendJson(res, 400, {
          success: false,
          error:
            verifyResult.error ||
            'Incorrect verification code. Please check the 6-digit code and try again.',
        });
      }

      const supabaseUser = verifyResult.user;

      // 4. Retrieve pending signup metadata if this was a signup
      const pending = pendingRegistrations.get(normalizedPhone);
      const finalName = full_name?.trim() || pending?.fullName;
      const finalDob = date_of_birth?.trim() || pending?.dob;
      const finalAddress = address?.trim() || pending?.address;
      const finalOccupation = occupation_status?.trim() || pending?.occupation;
      const finalGender = gender || pending?.gender;

      // 5. Connect or create user profile in database
      const { user, profile, isNewUser } = getOrCreateUserByPhone(normalizedPhone, {
        full_name: finalName,
        date_of_birth: finalDob,
        address: finalAddress,
        occupation_status: finalOccupation,
        gender: finalGender,
        supabase_user_id: supabaseUser.id,
      });

      // Clear pending signup data
      pendingRegistrations.delete(normalizedPhone);

      // 6. Create authenticated session token
      const sessionToken = createUserSession(user.id);

      return sendJson(res, 200, {
        success: true,
        token: sessionToken,
        user: {
          id: user.id,
          phone_number: user.phone_number,
          supabase_id: supabaseUser.id,
        },
        profile,
        isNewUser,
        message: isNewUser
          ? `Welcome to Tia, ${profile.full_name}! Your account is ready.`
          : `Welcome back, ${profile.full_name}!`,
      });
    } catch (err: any) {
      console.error('OTP Verify error:', err);
      return sendJson(res, 500, {
        success: false,
        error: err.message || 'An unexpected error occurred while verifying OTP.',
      });
    }
  }

  // GET /api/auth/me -> Returns authenticated user & profile
  if (method === 'GET' && url.startsWith('/api/auth/me')) {
    const token = extractAuthToken(req);
    if (!token) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized: Missing session token' });
    }

    const auth = getUserByToken(token);
    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized: Invalid or expired session. Please log in again.',
      });
    }

    const memories = getUserMemories(auth.user.id);

    return sendJson(res, 200, {
      success: true,
      user: {
        id: auth.user.id,
        phone_number: auth.user.phone_number,
      },
      profile: auth.profile,
      memories,
    });
  }

  // POST /api/auth/logout
  if (method === 'POST' && url.startsWith('/api/auth/logout')) {
    const token = extractAuthToken(req);
    if (token) {
      destroyUserSession(token);
    }
    return sendJson(res, 200, { success: true, message: 'Logged out successfully.' });
  }

  return sendJson(res, 404, { success: false, error: 'Auth endpoint not found.' });
}
