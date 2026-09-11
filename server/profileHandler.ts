import type { IncomingMessage, ServerResponse } from 'http';
import {
  getUserByToken,
  getUserProfile,
  updateUserProfile,
  getUserMemories,
  addUserMemory,
  deleteUserMemory,
  forgetUserMemoryByQuery,
  getUserConversation,
  saveUserConversation,
  clearUserConversation,
  loadDatabase,
} from './db.ts';
import { extractAuthToken } from './authHandler.ts';

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

// Authenticate request or return null with 401 response
function authenticateRequest(req: IncomingMessage, res: ServerResponse): { userId: string } | null {
  const token = extractAuthToken(req);
  if (!token) {
    sendJson(res, 401, {
      success: false,
      error: 'Unauthorized: No active session. Please log in to access your personal profile.',
    });
    return null;
  }

  const auth = getUserByToken(token);
  if (!auth) {
    sendJson(res, 401, {
      success: false,
      error: 'Unauthorized: Session expired or invalid. Please log in again.',
    });
    return null;
  }

  return { userId: auth.user.id };
}

export async function handleProfileRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '';
  const method = req.method?.toUpperCase();

  const auth = authenticateRequest(req, res);
  if (!auth) return; // 401 already sent

  const { userId } = auth;

  // GET /api/profile -> retrieve current user's profile and memories
  if (method === 'GET' && (url === '/api/profile' || url.startsWith('/api/profile?'))) {
    const profile = getUserProfile(userId);
    const memories = getUserMemories(userId);
    return sendJson(res, 200, { success: true, profile, memories });
  }

  // PUT /api/profile -> update current user's profile
  if (method === 'PUT' && (url === '/api/profile' || url.startsWith('/api/profile?'))) {
    const body = await readRequestBody(req);
    const updated = updateUserProfile(userId, body);
    const memories = getUserMemories(userId);
    return sendJson(res, 200, { success: true, profile: updated, memories });
  }

  // GET /api/profile/memories -> list only current user's memories
  if (method === 'GET' && url.startsWith('/api/profile/memories')) {
    const memories = getUserMemories(userId);
    return sendJson(res, 200, { success: true, memories });
  }

  // POST or PUT /api/profile/remember -> remember explicit fact for current user
  if (
    (method === 'POST' || method === 'PUT') &&
    url.startsWith('/api/profile/remember')
  ) {
    const body = await readRequestBody(req);
    const fact = typeof body.fact === 'string' ? body.fact.trim() : '';
    if (!fact) {
      return sendJson(res, 400, {
        success: false,
        error: 'Fact text is required to remember.',
      });
    }
    const category = body.category || 'general';
    const key = body.key || undefined;
    const memory = addUserMemory(userId, fact, category, key);
    const memories = getUserMemories(userId);
    const profile = getUserProfile(userId);

    return sendJson(res, 200, {
      success: true,
      memory,
      memories,
      profile,
      message: 'Fact remembered for your personal assistant',
    });
  }

  // POST /api/profile/forget -> forget memory matching text or key
  if (method === 'POST' && url.startsWith('/api/profile/forget')) {
    const body = await readRequestBody(req);
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return sendJson(res, 400, {
        success: false,
        error: 'Query text is required to forget.',
      });
    }
    const removedCount = forgetUserMemoryByQuery(userId, query);
    const memories = getUserMemories(userId);
    return sendJson(res, 200, {
      success: true,
      removedCount,
      memories,
      message: `${removedCount} memory item(s) removed.`,
    });
  }

  // DELETE /api/profile/memory -> delete specific memory by ID
  if (method === 'DELETE' && url.includes('/api/profile/memory')) {
    let id = '';
    const urlObj = new URL(url, 'http://localhost');
    id = urlObj.searchParams.get('id') || '';

    if (!id) {
      const body = await readRequestBody(req);
      id = body.id || '';
    }

    if (!id) {
      const parts = urlObj.pathname.split('/');
      id = parts[parts.length - 1];
    }

    if (!id || id === 'memory') {
      return sendJson(res, 400, {
        success: false,
        error: 'Memory ID is required for deletion.',
      });
    }

    const deleted = deleteUserMemory(userId, id);
    const memories = getUserMemories(userId);
    const profile = getUserProfile(userId);

    return sendJson(res, 200, {
      success: deleted,
      memories,
      profile,
      message: deleted ? 'Memory removed.' : 'Memory not found or not owned by you.',
    });
  }

  return sendJson(res, 404, { success: false, error: 'Profile endpoint not found' });
}

// Conversation history endpoints for authenticated user
export async function handleConversationRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '';
  const method = req.method?.toUpperCase();

  const auth = authenticateRequest(req, res);
  if (!auth) return;

  const { userId } = auth;

  // GET /api/conversations -> fetch user's isolated conversation history
  if (method === 'GET') {
    const conv = getUserConversation(userId);
    const msgs = conv ? conv.messages : [];
    return sendJson(res, 200, {
      success: true,
      messages: msgs,
      conversations: conv ? [conv] : [],
    });
  }

  // POST /api/conversations -> save user's conversation history
  if (method === 'POST') {
    const body = await readRequestBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const conv = saveUserConversation(userId, messages);
    return sendJson(res, 200, {
      success: true,
      messages: conv.messages,
    });
  }

  // DELETE /api/conversations -> clear user's conversation history
  if (method === 'DELETE') {
    clearUserConversation(userId);
    return sendJson(res, 200, {
      success: true,
      messages: [],
      message: 'Conversation history cleared.',
    });
  }

  return sendJson(res, 404, { success: false, error: 'Conversation endpoint not found' });
}
