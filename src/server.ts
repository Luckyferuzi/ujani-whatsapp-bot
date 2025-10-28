// src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env, assertCriticalEnv } from './config.js';
import { webhook } from './routes/webhook.js';
import { status } from './routes/status.js';

const app = express();

// Hide tech stack header
app.disable('x-powered-by');

/**
 * Capture raw body so verifySignature(req) can HMAC the exact payload.
 * Must run BEFORE json/urlencoded parsers.
 */
app.use(
  express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf ? buf.toString('utf8') : '';
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Basic CORS (adjust origins as needed)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-hub-signature-256', 'Authorization'],
  })
);

// If behind a proxy/load balancer
app.set('trust proxy', 1);

/** Lightweight ping */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    uptime: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  });
});

/**
 * Mount routes
 * - webhook: GET /webhook (verification), POST /webhook (events), GET / (ok)
 * - status:  GET /api/orders (admin JSON listing)
 */
app.use('/', webhook);
app.use('/api', status);

/** 404 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

/** Error handler */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

/** Boot */
assertCriticalEnv(['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'VERIFY_TOKEN'] as any);
const port = Number(env.PORT) || 3000;
app.listen(port, () => {
  console.log(`[server] listening on :${port}`);
});
