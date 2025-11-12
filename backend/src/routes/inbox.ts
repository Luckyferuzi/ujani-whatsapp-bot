import { Router } from 'express';
import { listConversations, listMessages } from '../db/queries.js';

const r = Router();

r.get('/api/conversations', async (_req, res) => {
  try { res.json(await listConversations()); }
  catch (e) { console.error(e); res.status(500).json({ error: 'list fail' }); }
});

r.get('/api/conversations/:id/messages', async (req, res) => {
  try { res.json(await listMessages(Number(req.params.id))); }
  catch (e) { console.error(e); res.status(500).json({ error: 'msgs fail' }); }
});

export default r;
