import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { handleChatRequest } from './server/chatHandler.ts';
import { handleProfileRequest, handleConversationRequest } from './server/profileHandler.ts';
import { handleAuthRequest } from './server/authHandler.ts';

dotenv.config();

// Safe resolution for __dirname in both ESM and CJS/bundled environments
const getDirname = () => {
  if (typeof __dirname !== 'undefined') return __dirname;
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};
const currentDirname = getDirname();

const app = express();
const PORT = 3000;

app.use(express.json());

// Vercel path normalizer: ensures /api routes are properly directed regardless of proxy rewrites
app.use((req, _res, next) => {
  const matchedPath = req.headers['x-matched-path'] as string | undefined;
  if (matchedPath && matchedPath.startsWith('/api') && (req.url === '/api' || req.url === '/api/' || req.url === '/')) {
    req.url = matchedPath;
    (req as any).originalUrl = matchedPath;
  } else if (!req.url.startsWith('/api')) {
    if (
      req.url.startsWith('/auth') ||
      req.url.startsWith('/chat') ||
      req.url.startsWith('/profile') ||
      req.url.startsWith('/conversations') ||
      req.url.startsWith('/health')
    ) {
      req.url = '/api' + req.url;
      (req as any).originalUrl = req.url;
    }
  }
  next();
});

// Safe API request logging (Requirement 22: log method, path, status, duration - no sensitive data)
app.use('/api', (req, res, next) => {
  const start = Date.now();
  const safePath = (req.originalUrl || req.url).split('?')[0];
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${safePath} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Prevent caching for all API endpoints (auth, chat, profile, conversations, etc.)
app.use('/api', (_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  next();
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', assistant: 'Tia' });
});

// API endpoint for Authentication (signup, login, logout, me, check-username, status)
app.use('/api/auth', (req, res, next) => {
  Promise.resolve(handleAuthRequest(req, res)).catch(next);
});

// API endpoint for Tia chat
app.post('/api/chat', (req, res, next) => {
  Promise.resolve(handleChatRequest(req, res)).catch(next);
});

// API endpoint for persistent owner profile and memories
app.use('/api/profile', (req, res, next) => {
  Promise.resolve(handleProfileRequest(req, res)).catch(next);
});

// API endpoint for user-specific conversation history
app.use('/api/conversations', (req, res, next) => {
  Promise.resolve(handleConversationRequest(req, res)).catch(next);
});

// Final API 404 handler: guarantees /api routes return JSON, never HTML (Requirement 21)
app.all('/api/*', (_req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
  });
});
app.all('/api', (_req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
  });
});

// Explicit JSON error handler for API errors (Requirement 20)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.url.startsWith('/api')) {
    console.error(`[API Error] ${req.method} ${req.url}:`, err?.message || err);
    res.status(err.status || 500).json({
      success: false,
      error: err?.message || 'Internal Server Error',
    });
    return;
  }
  next(err);
});

// Serve production static assets from dist
const distPath = path.resolve(currentDirname, 'dist');
app.use(express.static(distPath));

// SPA fallback to index.html with strict protection against intercepting /api (Requirements 18 & 19)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found',
    });
  }

  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.sendFile(path.resolve(distPath, 'index.html'));
});

// Only bind port when run directly as the main script (Vercel invokes the exported app as a serverless handler)
const isDirectRun = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith('server.ts') ||
      process.argv[1].endsWith('server.js') ||
      process.argv[1].endsWith('server.cjs'))
);

if (process.env.VERCEL !== '1' && (isDirectRun || process.env.RUN_SERVER === '1')) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tia AI Voice Assistant server running at http://0.0.0.0:${PORT}`);
  });
}

export { app };
export default app;
