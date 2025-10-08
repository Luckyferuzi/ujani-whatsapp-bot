// src/routes/status.ts
// ESM-safe: note the ".js" extension in relative imports after TS build.
// Exports: default router + named `status`

import type { Request, Response } from "express";
import { Router } from "express";
import pino from "pino";

// ✅ Include ".js" so Node can resolve /app/dist/orders.js at runtime
import { getOrder } from "../orders.js";

const logger = pino({ name: "status" });

export const router = Router();
export const status = router; // named export for convenience
export default router;

/**
 * GET /status?id=UJANI-XXXX
 * Returns order status JSON for dashboards/health checks.
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const id = (req.query.id ?? "").toString().trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "missing id" });
    }
    const o = getOrder(id);
    if (!o) {
      return res.status(404).json({ ok: false, error: "not found" });
    }
    const paid = o.paidTZS ?? 0;
    const total = o.totalTZS ?? 0;
    const balance = Math.max(0, total - paid);

    return res.json({
      ok: true,
      order: {
        orderId: o.orderId,
        status: o.status ?? "awaiting",
        totalTZS: total,
        paidTZS: paid,
        balanceTZS: balance,
        customerName: o.customerName ?? "",
        customerPhone: o.customerPhone ?? "",
        address: {
          street: o.addressStreet ?? "",
          city: o.addressCity ?? "",
          ward: (o as any).addressWard ?? "",
          country: o.addressCountry ?? "",
        },
        items: o.items ?? [],
        createdAt: (o as any).createdAt ?? (o as any).createdISO ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "status root error");
    return res.status(500).json({ ok: false, error: "internal" });
  }
});

/**
 * GET /status/:orderId
 * Same as above but using path param.
 */
router.get("/:orderId", (req: Request, res: Response) => {
  try {
    const id = (req.params.orderId ?? "").toString().trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "missing id" });
    }
    const o = getOrder(id);
    if (!o) {
      return res.status(404).json({ ok: false, error: "not found" });
    }
    const paid = o.paidTZS ?? 0;
    const total = o.totalTZS ?? 0;
    const balance = Math.max(0, total - paid);

    return res.json({
      ok: true,
      order: {
        orderId: o.orderId,
        status: o.status ?? "awaiting",
        totalTZS: total,
        paidTZS: paid,
        balanceTZS: balance,
        customerName: o.customerName ?? "",
        customerPhone: o.customerPhone ?? "",
        address: {
          street: o.addressStreet ?? "",
          city: o.addressCity ?? "",
          ward: (o as any).addressWard ?? "",
          country: o.addressCountry ?? "",
        },
        items: o.items ?? [],
        createdAt: (o as any).createdAt ?? (o as any).createdISO ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "status by id error");
    return res.status(500).json({ ok: false, error: "internal" });
  }
});
