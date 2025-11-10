// src/server.ts
import express from 'express';
import { webhook } from './routes/webhook.js';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';

import inboxRoutes from './routes/inbox';
import sendRoutes from './routes/send';
import { attachSockets } from './sockets';



const app = express();

/* ------------------------------ Minimal CORS ------------------------------ */
// (Avoids the need for 'cors' typings)
// If you already installed @types/cors, you can swap this for `app.use(cors())`.

// ensure app uses security + CORS (keep your existing imports/middleware)
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || '*').split(',') }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Hub-Signature-256, X-Hub-Signature'
  );
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------------------- Capture RAW body for HMAC check ------------------- */
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

/* ----------------------------- Request logging ---------------------------- */
// Mirrors your existing logs like: [server] POST /webhook sig:yes len:493
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

/* --------------------------------- Routes -------------------------------- */
app.use('/', webhook);
// mount new routes (keep your existing /status and /webhook)
app.use(inboxRoutes);
app.use(sendRoutes);

app.get('/', (_req, res) => res.status(200).send('ok'));

/* ------------------------------- Start server ----------------------------- */

// replace app.listen(...) with:
const server = http.createServer(app);
attachSockets(server, (process.env.CORS_ORIGIN || '*').split(','));
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`Backend on :${PORT}`));

export default app;
