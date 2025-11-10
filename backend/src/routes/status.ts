// src/routes/status.ts
import { Router, Request, Response } from 'express';
import { listAllOrders, listOrdersByName, computeTotal } from '../orders.js';

export const status = Router();

/**
 * GET /api/orders
 * Optional: ?name=John%20Doe  (exact match, case-insensitive)
 *
 * Returns a lightweight JSON list for quick admin checks.
 * NOTE: No auth here—protect at the edge (IP allowlist/reverse-proxy) if exposing publicly.
 */
status.get('/orders', (req: Request, res: Response) => {
  const nameQ = (req.query.name as string | undefined)?.trim() || '';
  const orders = nameQ ? listOrdersByName(nameQ) : listAllOrders();

  const data = orders.map(o => ({
    id: o.id,
    customerName: o.customerName,
    phone: o.phone ?? null,
    items: o.items.map(it => ({
      sku: it.sku,
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      lineTotal: it.unitPrice * it.qty,
    })),
    delivery: o.delivery,
    status: o.status,
    createdAt: o.createdAt,
    total: computeTotal(o),
    hasProof: !!o.proof,
  }));

  res.json({ count: data.length, orders: data });
});
