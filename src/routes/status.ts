import { Router } from 'express';
import { listOrders, listOrdersByName, computeTotal } from '../orders.js';

export const status = Router();

/**
 * GET /api/orders?name=John%20Peter%20Smith
 * - ?name present  -> that name's orders (newest first)
 * - ?name missing -> all orders (newest first)
 */
status.get('/orders', (req, res) => {
  const name = (req.query.name as string | undefined)?.trim();
  const orders = name ? listOrdersByName(name) : listOrders();

  const payload = orders.map(o => ({
    createdAt: o.createdAt,
    customerName: o.customerName,
    phone: o.phone ?? null,
    delivery: o.delivery,
    items: o.items,
    status: o.status,
    proof: o.proof ?? null,
    total: computeTotal(o),
  }));

  res.json({ count: payload.length, orders: payload });
});
