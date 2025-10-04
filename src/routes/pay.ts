import type { Request, Response } from 'express';
import { Router } from 'express';
import { getOrder, markPaid } from '../orders.js';
import { buildWhatsAppDeeplink } from '../paylink.js';

export const pay = Router();

function page(title: string, body: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'; margin: 24px; }
  .card { max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { line-height: 1.5; }
  .total { font-weight: 700; }
  button { padding: 12px 16px; border-radius: 10px; border: 0; background: #111827; color: white; font-weight: 600; cursor: pointer; }
  .muted { color: #6b7280; font-size: 12px; }
</style>
</head><body><div class="card">${body}</div></body></html>`;
}

pay.get('/pay/:orderId', (req: Request, res: Response) => {
  const orderId = req.params.orderId;
  const o = getOrder(orderId);
  if (!o) return res.status(404).send(page('Not found', `<h1>Order not found</h1><p>Order ${orderId} was not created.</p>`));
  const nf = new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
  const body = `
  <h1>Pay for ${o.title}</h1>
  <p>Order ID: <strong>${o.orderId}</strong></p>
  <p class="total">Total: ${nf.format(o.totalTZS)}</p>
  <form method="POST" action="/pay/${encodeURIComponent(o.orderId)}/confirm">
    <button type="submit">Pay now (simulate)</button>
  </form>
  <p class="muted">This page is for testing only. On success, you will be redirected back to WhatsApp.</p>`;
  res.send(page(`Pay ${o.orderId}`, body));
});

pay.post('/pay/:orderId/confirm', (req: Request, res: Response) => {
  const orderId = req.params.orderId;
  const o = getOrder(orderId);
  if (!o) return res.status(404).send(page('Not found', `<h1>Order not found</h1>`));
  // Simulate success
  markPaid(orderId);
  const deeplink = buildWhatsAppDeeplink(`Paid Order ${orderId}`);
  res.redirect(302, deeplink);
});
