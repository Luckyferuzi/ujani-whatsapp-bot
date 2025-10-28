// src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env, assertCriticalEnv } from './config.js';
import { webhook } from './routes/webhook.js';
import { status } from './routes/status.js';

const app = express();
app.disable('x-powered-by');

/** capture raw body for signature HMAC */
app.use(
  express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf ? buf.toString('utf8') : '';
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/** basic CORS */
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-hub-signature-256', 'Authorization'],
  })
);

/** log webhook traffic early (so you see *something* on Render) */
app.use((req, _res, next) => {
  if (req.path.startsWith('/webhook')) {
    const sig = req.header('x-hub-signature-256');
    console.log(
      `[server] ${req.method} ${req.path} sig:${sig ? 'yes' : 'no'} len:${Number(req.headers['content-length'] || 0)}`
    );
  }
  next();
});

app.set('trust proxy', 1);

/** health */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    uptime: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  });
});

/** routes */
app.use('/', webhook);
app.use('/api', status);

/** 404 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

/** errors */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

/** boot */
assertCriticalEnv(['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'VERIFY_TOKEN'] as any);
const port = Number(env.PORT) || 3000;
app.listen(port, () => {
  console.log(`[server] listening on :${port}`);
});
