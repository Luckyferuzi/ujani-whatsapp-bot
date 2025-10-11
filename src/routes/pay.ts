// src/routes/pay.ts
// Minimal payment endpoints using existing orders helpers (no markPaid import)

import type { Request, Response } from "express";
import { Router } from "express";
import pino from "pino";

import {
  getOrder,
  attachTxnMessage,
  attachTxnImage,
} from "../orders.js";

const logger = pino({ name: "pay" });
export const router = Router();
export default router;

/**
 * POST /pay/message
 * Body: { orderId: string, message?: string, amountTZS?: number }
 * Saves a payment note on an order.
 */
router.post("/message", async (req: Request, res: Response) => {
  try {
    const { orderId, message, amountTZS } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    const order = getOrder(String(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const note = [
      message?.toString().trim() || "",
      amountTZS ? `(amount: TSh ${Number(amountTZS).toLocaleString("en-US")})` : "",
    ]
      .filter(Boolean)
      .join(" ");

    attachTxnMessage(orderId, note || "Payment note attached.");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pay/message error");
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /pay/image
 * Body: { orderId: string, mediaId: string, caption?: string }
 * Attaches a payment screenshot image to an order.
 */
router.post("/image", async (req: Request, res: Response) => {
  try {
    const { orderId, mediaId, caption } = req.body || {};
    if (!orderId || !mediaId) return res.status(400).json({ error: "orderId and mediaId required" });
    const order = getOrder(String(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    attachTxnImage(orderId, String(mediaId), caption ? String(caption) : "");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pay/image error");
    return res.status(500).json({ error: "internal_error" });
  }
});
