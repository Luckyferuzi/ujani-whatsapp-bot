// src/routes/psp.ts
import type { Request, Response } from 'express';
import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config.js';
import { buildWhatsAppDeeplink } from '../paylink.js';
import { clickpesaQueryByRef } from '../psp/clickpesa.js';

import { getOrder } from '../orders.js';            // order details
import { addPayment, getPaidSoFar } from '../store.js'; // ledger lives here

export const psp = Router();

/** Compute HMAC SHA256 checksum the same way as requests: sort keys and concat values */
function computeChecksum(obj: Record<string, any>, secret: string) {
  const keys = Object.keys(obj).filter(k => k !== 'checksum').sort();
  const concat = keys.map(k => String(obj[k] ?? '')).join('');
  return crypto.createHmac('sha256', secret).update(concat).digest('hex');
}

/** Verify ClickPesa webhook: supports either header or body.data.checksum */
function verifyClickpesaWebhook(req: Request): boolean {
  if (!env.CLICKPESA_CHECKSUM_SECRET) return true; // verification disabled
  const headerSig = req.get('x-clickpesa-signature') || req.get('X-ClickPesa-Signature');
  if (headerSig) {
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw) return false;
    const expected = crypto.createHmac('sha256', env.CLICKPESA_CHECKSUM_SECRET).update(raw).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(expected));
  }
  // Fallback to body.data.checksum
  const data = req.body?.data || {};
  const provided = data?.checksum;
  if (!provided) return false;
  const expected = computeChecksum(data, env.CLICKPESA_CHECKSUM_SECRET);
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/** Hosted Checkout success return → confirm paid and deep-link back to WhatsApp */
psp.get('/payments/clickpesa/return', async (req: Request, res: Response) => {
  const orderId = String(req.query.ref || '');
  if (!orderId) return res.status(400).send('Missing ref');
  try {
    const arr = await clickpesaQueryByRef(orderId);
    const isPaid = Array.isArray(arr) && arr.some((p: any) => {
      const s = String(p.status || '').toUpperCase();
      return s === 'SUCCESS' || s === 'SETTLED';
    });
    if (isPaid) {
      const o = getOrder(orderId);
      const amount = o?.totalTZS ?? 0;
      if (amount > 0) {
        addPayment({ id: `cp_${Date.now()}`, orderId, amountTZS: amount, method: 'Checkout', timestamp: new Date().toISOString() });
      }
      const deeplink = buildWhatsAppDeeplink(`Paid Order ${orderId}`);
      return res.redirect(302, deeplink);
    }
    return res.send(`<h3>Payment pending for ${orderId}</h3>`);
  } catch (e: any) {
    return res.status(200).send(`<pre>${e.message}</pre>`);
  }
});

/** ClickPesa Webhook (PAYMENT RECEIVED / FAILED) with checksum verification */
psp.post('/payments/clickpesa/webhook', async (req: Request, res: Response) => {
  try {
    if (!verifyClickpesaWebhook(req)) {
      // Acknowledge but ignore invalid signature to avoid retry storms
      return res.json({ received: true, verified: false });
    }

    const event = String((req.body?.event || req.body?.eventType || '')).toUpperCase();
    const data = req.body?.data || {};
    const orderId = data?.orderReference || '';

    if (!orderId) return res.json({ received: true });

    if (event.includes('RECEIVED') || String(data?.status || '').toUpperCase() === 'SUCCESS') {
      // Partial or full payment
      const amount = Number(data?.collectedAmount || data?.amount || 0);
      if (amount > 0) {
        addPayment({
          id: data?.paymentId || `cp_${Date.now()}`,
          orderId,
          amountTZS: amount,
          method: 'USSD',
          timestamp: new Date().toISOString()
        });
      }
      // Optionally: use getPaidSoFar(orderId) here to decide on notifications.
      void getPaidSoFar(orderId);
    }

    return res.json({ received: true, verified: true });
  } catch {
    return res.json({ received: true });
  }
});
