import type { IncomingMessage, ServerResponse } from 'http';
import {
  loadDatabase,
  saveDatabase,
  hashPassword,
  verifyPassword,
  generateId,
  createUserSession,
  destroyUserSession,
  getUserByToken,
  calculateAge,
  addUserMemory,
} from './db.ts';

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

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export function extractAuthToken(req: IncomingMessage): string | null {
  const authHeader = req.headers['authorization'] || '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  // Optional query token fallback for testing
  const url = req.url || '';
  try {
    const urlObj = new URL(url, 'http://localhost');
    const qToken = urlObj.searchParams.get('token');
    if (qToken) return qToken.trim();
  } catch {
    // ignore
  }
  return null;
}

export async function handleAuthRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '';
  const method = req.method?.toUpperCase();

  // POST /api/auth/signup
  if (method === 'POST' && url.startsWith('/api/auth/signup')) {
    try {
      const body = await readRequestBody(req);
      const {
        full_name,
        email,
        password,
        date_of_birth,
        address,
        gender,
        profile_picture,
        occupation_status,
      } = body;

      // Validate required fields
      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return sendJson(res, 400, { success: false, error: 'Full name is required.' });
      }

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return sendJson(res, 400, { success: false, error: 'A valid email address is required.' });
      }

      if (!password || typeof password !== 'string' || password.length < 6) {
        return sendJson(res, 400, {
          success: false,
          error: 'Password must be at least 6 characters long.',
        });
      }

      if (!date_of_birth || typeof date_of_birth !== 'string') {
        return sendJson(res, 400, {
          success: false,
          error: 'Date of birth is required (YYYY-MM-DD).',
        });
      }

      const cleanEmail = email.toLowerCase().trim();
      const cleanName = full_name.trim();
      const db = loadDatabase();

      // Check if email already exists
      const existingUser = db.users.find((u) => u.email === cleanEmail);
      if (existingUser) {
        return sendJson(res, 409, {
          success: false,
          error: 'An account with this email address already exists. Please log in.',
        });
      }

      // Calculate age automatically from Date of Birth
      const computedAge = calculateAge(date_of_birth);
      const { hash, salt } = hashPassword(password);
      const userId = generateId('usr');
      const profileId = generateId('prof');
      const now = new Date().toISOString();

      const newUser = {
        id: userId,
        email: cleanEmail,
        password_hash: hash,
        salt,
        created_at: now,
        updated_at: now,
      };

      const newProfile = {
        id: profileId,
        user_id: userId,
        full_name: cleanName,
        date_of_birth: date_of_birth.trim(),
        address: (address || 'India').trim(),
        age: computedAge,
        gender: gender || 'unspecified',
        profile_picture: profile_picture || '',
        occupation_status: occupation_status ? occupation_status.trim() : 'Explorer',
        created_at: now,
        updated_at: now,
      };

      db.users.push(newUser);
      db.profiles.push(newProfile);
      saveDatabase(db);

      // Create initial private memory for the user
      addUserMemory(
        userId,
        `${cleanName} is the owner and companion of Tia.`,
        'identity',
        'owner_identity'
      );
      if (address && address.trim()) {
        addUserMemory(
          userId,
          `${cleanName} lives in ${address.trim()}.`,
          'personal',
          'location'
        );
      }
      if (occupation_status && occupation_status.trim()) {
        addUserMemory(
          userId,
          `${cleanName} is currently ${occupation_status.trim()}.`,
          'work',
          'occupation'
        );
      }

      // Generate session token
      const token = createUserSession(userId);

      return sendJson(res, 201, {
        success: true,
        token,
        user: { id: userId, email: cleanEmail },
        profile: newProfile,
        isNewUser: true,
        message: 'Account created successfully! Welcome to Tia.',
      });
    } catch (err) {
      console.error('Signup error:', err);
      return sendJson(res, 500, {
        success: false,
        error: 'Failed to create account. Please try again.',
      });
    }
  }

  // POST /api/auth/login
  if (method === 'POST' && url.startsWith('/api/auth/login')) {
    try {
      const body = await readRequestBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendJson(res, 400, {
          success: false,
          error: 'Email and password are required.',
        });
      }

      const cleanEmail = String(email).toLowerCase().trim();
      const db = loadDatabase();
      const user = db.users.find((u) => u.email === cleanEmail);

      if (!user) {
        return sendJson(res, 401, {
          success: false,
          error: 'Invalid email or password. Please check your credentials.',
        });
      }

      const isMatch = verifyPassword(String(password), user.password_hash, user.salt);
      if (!isMatch) {
        return sendJson(res, 401, {
          success: false,
          error: 'Invalid email or password. Please check your credentials.',
        });
      }

      let profile = db.profiles.find((p) => p.user_id === user.id);
      if (!profile) {
        profile = {
          id: generateId('prof'),
          user_id: user.id,
          full_name: cleanEmail.split('@')[0],
          date_of_birth: '2000-01-01',
          address: 'India',
          age: calculateAge('2000-01-01'),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.profiles.push(profile);
        saveDatabase(db);
      } else {
        profile.age = calculateAge(profile.date_of_birth);
      }

      const token = createUserSession(user.id);

      return sendJson(res, 200, {
        success: true,
        token,
        user: { id: user.id, email: user.email },
        profile,
        isNewUser: false,
        message: `Welcome back, ${profile.full_name}!`,
      });
    } catch (err) {
      console.error('Login error:', err);
      return sendJson(res, 500, {
        success: false,
        error: 'An unexpected error occurred during login.',
      });
    }
  }

  // GET /api/auth/me
  if (method === 'GET' && url.startsWith('/api/auth/me')) {
    const token = extractAuthToken(req);
    if (!token) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized: Missing token' });
    }

    const auth = getUserByToken(token);
    if (!auth) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized: Invalid or expired session' });
    }

    return sendJson(res, 200, {
      success: true,
      user: { id: auth.user.id, email: auth.user.email },
      profile: auth.profile,
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

  // POST /api/auth/forgot-password
  if (method === 'POST' && url.startsWith('/api/auth/forgot-password')) {
    try {
      const body = await readRequestBody(req);
      const { email } = body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return sendJson(res, 400, {
          success: false,
          error: 'Please enter a valid email address.',
        });
      }

      const cleanEmail = email.toLowerCase().trim();
      const db = loadDatabase();
      const user = db.users.find((u) => u.email === cleanEmail);

      if (!user) {
        return sendJson(res, 404, {
          success: false,
          error: 'No account registered with this email address. Please verify your email or create a new account.',
        });
      }

      // Generate real 6-digit verification code & reset token (valid for 15 mins)
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const resetToken = generateId('rst');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      (user as any).reset_code = resetCode;
      (user as any).reset_token = resetToken;
      (user as any).reset_expires_at = expiresAt;
      saveDatabase(db);

      const profile = db.profiles.find((p) => p.user_id === user.id);
      const userName = profile?.full_name || 'User';

      return sendJson(res, 200, {
        success: true,
        email: cleanEmail,
        resetCode,
        resetToken,
        userName,
        message: `Verification code generated for ${userName} (${cleanEmail}): ${resetCode}. Please enter this 6-digit code and your new password below.`,
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      return sendJson(res, 500, {
        success: false,
        error: 'Failed to process password reset request. Please try again.',
      });
    }
  }

  // POST /api/auth/reset-password
  if (method === 'POST' && url.startsWith('/api/auth/reset-password')) {
    try {
      const body = await readRequestBody(req);
      const { email, resetCode, newPassword } = body;

      if (!email || !email.includes('@')) {
        return sendJson(res, 400, {
          success: false,
          error: 'A valid email address is required.',
        });
      }

      if (!resetCode) {
        return sendJson(res, 400, {
          success: false,
          error: '6-digit verification code is required.',
        });
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return sendJson(res, 400, {
          success: false,
          error: 'New password must be at least 6 characters long.',
        });
      }

      const cleanEmail = String(email).toLowerCase().trim();
      const cleanCode = String(resetCode).trim();
      const db = loadDatabase();
      const user = db.users.find((u) => u.email === cleanEmail);

      if (!user) {
        return sendJson(res, 404, {
          success: false,
          error: 'Account not found. Please check your email address.',
        });
      }

      const userWithReset = user as any;
      if (!userWithReset.reset_code || userWithReset.reset_code !== cleanCode) {
        return sendJson(res, 400, {
          success: false,
          error: 'Invalid verification code. Please check the 6-digit code and try again.',
        });
      }

      if (
        userWithReset.reset_expires_at &&
        new Date(userWithReset.reset_expires_at).getTime() < Date.now()
      ) {
        return sendJson(res, 400, {
          success: false,
          error: 'Verification code has expired. Please request a new code.',
        });
      }

      // Hash the new password with a new cryptographically random salt
      const { hash, salt } = hashPassword(newPassword);
      user.password_hash = hash;
      user.salt = salt;
      user.updated_at = new Date().toISOString();

      // Clear the used reset code
      delete userWithReset.reset_code;
      delete userWithReset.reset_token;
      delete userWithReset.reset_expires_at;

      saveDatabase(db);

      return sendJson(res, 200, {
        success: true,
        message: 'Password has been successfully updated! You can now log in with your new password.',
      });
    } catch (err) {
      console.error('Reset password error:', err);
      return sendJson(res, 500, {
        success: false,
        error: 'Failed to reset password. Please try again.',
      });
    }
  }

  return sendJson(res, 404, { success: false, error: 'Auth endpoint not found' });
}
