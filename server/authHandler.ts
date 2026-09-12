import type { IncomingMessage, ServerResponse } from 'http';
import {
  createUserAccount,
  loginUser,
  isUsernameAvailable,
  getUserByToken,
  destroyUserSession,
  getUserMemories,
} from './db.ts';

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

  // GET /api/auth/status
  if (method === 'GET' && url.startsWith('/api/auth/status')) {
    return sendJson(res, 200, {
      success: true,
      provider: 'credentials',
      status: 'ready',
    });
  }

  // GET /api/auth/check-username?username=xyz
  if (method === 'GET' && url.startsWith('/api/auth/check-username')) {
    try {
      const parsedUrl = new URL(url, 'http://localhost');
      const username = parsedUrl.searchParams.get('username') || '';
      if (!username || username.trim().length < 3) {
        return sendJson(res, 200, {
          success: true,
          available: false,
          reason: 'Username must be at least 3 characters',
        });
      }
      const available = isUsernameAvailable(username);
      return sendJson(res, 200, {
        success: true,
        username: username.trim().toLowerCase(),
        available,
      });
    } catch (err: any) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/auth/signup
  if (method === 'POST' && url.startsWith('/api/auth/signup')) {
    try {
      const body = await readRequestBody(req);
      const {
        full_name,
        username,
        password,
        date_of_birth,
        location,
        current_work,
        address, // alias
        occupation_status, // alias
      } = body;

      // Required field validations
      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return sendJson(res, 400, {
          success: false,
          error: 'Full Name is required.',
        });
      }

      if (!username || typeof username !== 'string' || !username.trim()) {
        return sendJson(res, 400, {
          success: false,
          error: 'Username is required.',
        });
      }

      const cleanUsername = username.trim().toLowerCase();
      if (cleanUsername.length < 3) {
        return sendJson(res, 400, {
          success: false,
          error: 'Username must be at least 3 characters long.',
        });
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
        return sendJson(res, 400, {
          success: false,
          error: 'Username can only contain letters, numbers, underscores, and hyphens.',
        });
      }

      // Check if username is already taken before attempting account creation
      if (!isUsernameAvailable(cleanUsername)) {
        return sendJson(res, 409, {
          success: false,
          code: 'USERNAME_TAKEN',
          error: `The username "@${cleanUsername}" is already registered. If this is your account, please log in instead.`,
          username: cleanUsername,
        });
      }

      if (!password || typeof password !== 'string' || password.length < 6) {
        return sendJson(res, 400, {
          success: false,
          error: 'Password must be at least 6 characters long.',
        });
      }

      if (!date_of_birth || typeof date_of_birth !== 'string' || !date_of_birth.trim()) {
        return sendJson(res, 400, {
          success: false,
          error: 'Date of Birth is required.',
        });
      }

      const birthDate = new Date(date_of_birth);
      if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
        return sendJson(res, 400, {
          success: false,
          error: 'Please enter a valid past Date of Birth (YYYY-MM-DD).',
        });
      }

      const userLoc = (location || address || '').trim();
      const userWork = (current_work || occupation_status || '').trim();

      // Create account in database
      const result = createUserAccount({
        full_name: full_name.trim(),
        username: cleanUsername,
        password,
        date_of_birth: date_of_birth.trim(),
        location: userLoc,
        current_work: userWork,
      });

      const memories = getUserMemories(result.user.id);

      return sendJson(res, 201, {
        success: true,
        token: result.token,
        user: result.user,
        profile: result.profile,
        memories,
        message: `Welcome to Tia, ${result.profile.full_name}! Your account has been created.`,
      });
    } catch (err: any) {
      // Return 400/409 validation response without logging as an unhandled server error
      const isTaken = err.message?.toLowerCase().includes('already taken');
      return sendJson(res, isTaken ? 409 : 400, {
        success: false,
        code: isTaken ? 'USERNAME_TAKEN' : 'SIGNUP_FAILED',
        error: err.message || 'Failed to create user account.',
      });
    }
  }

  // POST /api/auth/login
  if (method === 'POST' && url.startsWith('/api/auth/login')) {
    try {
      const body = await readRequestBody(req);
      const { username, password } = body;

      if (!username || !password) {
        return sendJson(res, 400, {
          success: false,
          error: 'Please provide both username and password.',
        });
      }

      const result = loginUser(username, password);

      return sendJson(res, 200, {
        success: true,
        token: result.token,
        user: result.user,
        profile: result.profile,
        memories: result.memories,
        message: `Welcome back, ${result.profile.full_name}!`,
      });
    } catch (err: any) {
      return sendJson(res, 401, {
        success: false,
        error: err.message || 'Invalid username or password.',
      });
    }
  }

  // GET /api/auth/me or GET /api/auth/session -> Returns authenticated user & profile
  if (method === 'GET' && (url.startsWith('/api/auth/me') || url.startsWith('/api/auth/session'))) {
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
      authenticated: true,
      user: auth.user,
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

