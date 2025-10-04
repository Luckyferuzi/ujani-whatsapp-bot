// src/routes/status.ts
// Admin/status routes. Shows orders with structured address.

import type { Request, Response } from 'express';
import { Router } from 'express';
import pino from 'pino';

import { listOrders } from '../orders.js';
import { formatTZS } from '../menu.js';

const logger = pino({ name: 'status_routes' });
export const statusRouter = Router();

statusRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

statusRouter.get('/orders', (_req: Request, res: Response) => {
  try {
    const orders = listOrders();

    const rows = orders.map((o: ReturnType<typeof listOrders>[number]) => ({
      orderId: o.orderId,
      title: o.title,
      productId: o.productId,
      createdAt: o.createdAt,
      customerName: o.customerName ?? '',
      addressStreet: o.addressStreet ?? '',
      addressCity: o.addressCity ?? '',
      addressCountry: o.addressCountry ?? '',
      totalTZS: o.totalTZS,
      totalFmt: formatTZS(o.totalTZS),
      paidTZS: o.paidTZS,
      paidFmt: formatTZS(o.paidTZS),
      balanceTZS: o.balanceTZS,
      balanceFmt: formatTZS(o.balanceTZS),
      status: o.status,
      txnMessage: o.txnMessage ?? null,
      txnImageId: o.txnImageId ?? null,
      txnImageCaption: o.txnImageCaption ?? null,
    }));

    res.json({ ok: true, count: rows.length, orders: rows });
  } catch (err) {
    logger.error({ err }, 'Failed to build orders status');
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});
