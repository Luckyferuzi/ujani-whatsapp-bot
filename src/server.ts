import express from 'express';
import pinoHttp from 'pino-http';
import { env } from './config.js';
import { webhook } from './routes/webhook.js';
import { statusRouter } from './routes/status.js';

const app = express();

// HTTP logging
app.use(pinoHttp());

// keep raw body for optional signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    (req as any).rawBody = buf;
  }
}));

// Root & health
app.get('/', (_req, res) => res.json({ ok: true, app: 'ujani-whatsapp-bot' }));
app.use('/api', statusRouter);

// WhatsApp webhook (GET verify + POST messages)
app.use('/webhook', webhook);

// Error handler
app.use((err: any, req: any, res: any, _next: any) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start
app.listen(env.PORT, () => {
  console.log(`✅ Server listening on :${env.PORT}`);
  console.log(`ℹ️  Public base URL set to: ${env.PUBLIC_BASE_URL}`);
});
