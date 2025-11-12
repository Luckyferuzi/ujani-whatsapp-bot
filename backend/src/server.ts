// src/server.ts
import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';

import { webhook } from './routes/webhook.js';   // your existing named export
import inboxRoutes from './routes/inbox.js';
import sendRoutes from './routes/send.js';
import { attachSockets } from './sockets.js';

const app = express();

/* ------------------------- Compute allowed CORS origins ------------------------- */
// Priority: CORS_ORIGIN (comma-separated) > PUBLIC_BASE_URL + local dev ports
const computedOrigins = (() => {
  const explicit = process.env.CORS_ORIGIN?.trim();
  if (explicit) {
    return explicit.split(',').map(s => s.trim()).filter(Boolean);
  }
  const list = ['http://localhost:3000', 'http://localhost:3001'];
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) list.push(base);
  return list;
})();

/* ------------------------------ Security & CORS ------------------------------- */
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: computedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Hub-Signature-256', 'X-Hub-Signature'],
    credentials: false,
  })
);
// Handle preflight quickly
app.options('*', cors({ origin: computedOrigins }));

/* ---------------------- Capture RAW body for HMAC check ----------------------- */
// IMPORTANT: must come BEFORE any routes that read req.body.
app.use(
  express.json({
    limit: '5mb',
    verify: (req: any, _res, buf) => {
      // Keep exact bytes Meta signed; do NOT convert to string here.
      req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '');
    },
  })
);

/* ----------------------------- Request logging -------------------------------- */
app.use((req: any, _res, next) => {
  if (req.method === 'POST' && req.path === '/webhook') {
    const hasSig =
      Boolean(req.header('x-hub-signature-256')) ||
      Boolean(req.header('x-hub-signature'));
    const len =
      (req.rawBody && req.rawBody.length) ||
      Number(req.header('content-length') || 0);
    console.log(
      `[server] POST /webhook sig:${hasSig ? 'yes' : 'no'} len:${len}`
    );
  }
  next();
});

/* --------------------------------- Routes ------------------------------------ */
// Your existing webhook router (kept exactly as you had it)
app.use('/', webhook);

// New UI APIs
app.use(inboxRoutes);
app.use(sendRoutes);

// Simple health
app.get('/', (_req, res) => res.status(200).send('ok'));

/* ------------------------------- Start server -------------------------------- */
const server = http.createServer(app);
attachSockets(server, computedOrigins);

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => {
  console.log(`Backend on :${PORT}`);
  console.log('CORS allowed origins:', computedOrigins);
  console.log('PUBLIC_BASE_URL:', process.env.PUBLIC_BASE_URL || '(unset)');
});

export default app;
