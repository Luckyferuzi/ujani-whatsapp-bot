import { Router } from 'express';
import { insertOutboundMessage, findConversationRecipientWa } from '../db/queries.js';
import { emit } from '../sockets.js';
import { request } from 'undici';

const WA_BASE = 'https://graph.facebook.com/v20.0';

const r = Router();

r.post('/api/send', async (req, res) => {
  try {
    const { conversationId, text } = req.body || {};
    if (!conversationId || !text) return res.status(400).json({ error: 'conversationId and text required' });

    const waId = await findConversationRecipientWa(Number(conversationId));
    if (!waId) return res.status(404).json({ error: 'conversation not found' });

    const url = `${WA_BASE}/${process.env.PHONE_NUMBER_ID}/messages`;
    const payload = { messaging_product: 'whatsapp', to: waId, type: 'text', text: { body: text } };

    const resp = await request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN || process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (resp.statusCode >= 300) {
      const errTxt = await resp.body.text();
      console.error('WA send error', resp.statusCode, errTxt);
      return res.status(502).json({ error: 'whatsapp send failed' });
    }

    const outRow = await insertOutboundMessage(Number(conversationId), 'text', text);
    emit('message.created', { conversation_id: Number(conversationId), message: outRow });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'send failed' });
  }
});

export default r;
