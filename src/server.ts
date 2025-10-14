// src/server.ts
import express from 'express';
import { env } from './config.js';
import { webhook } from './routes/webhook.js';
import { status } from './routes/status.js';

const app = express();

// Capture raw body so webhook signature verification can use it
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf; // used by verifySignature in webhook.ts
    },
  })
);

app.get('/', (_req, res) => {
  res.status(200).send('Ujani Herbal Bot is running');
});

// Routes
app.use('/', webhook);
app.use('/api', status);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(
  (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
);

const port = env.PORT ?? 3000;
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
