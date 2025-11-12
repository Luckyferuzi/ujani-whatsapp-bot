import { Router } from "express";
import db from "../db/knex.js"; // exists in your ZIP

export const inboxRoutes = Router();

/**
 * GET /api/conversations
 * Left pane list
 */
inboxRoutes.get("/conversations", async (_req, res) => {
  const items = await db("conversations as c")
    .join("customers as u", "u.id", "c.customer_id")
    .select(
      "c.id",
      "u.name",
      "u.phone",
      "u.lang",
      "c.agent_allowed",
      "c.last_user_message_at"
    )
    .orderBy("c.last_user_message_at", "desc")
    .limit(100);

  // unread counts — avoid TS2488 by using .first() (not array destructuring)
  for (const row of items) {
    const unreadRow = await db("messages")
      .where({ conversation_id: row.id, direction: "in", status: "delivered" })
      .count<{ count: string }>("id as count")
      .first();

    (row as any).unread_count = Number(unreadRow?.count ?? 0);
  }

  res.json({ items });
});

/**
 * GET /api/conversations/:id/messages
 * Center thread
 */
inboxRoutes.get("/conversations/:id/messages", async (req, res) => {
  const { id } = req.params;
  const messages = await db("messages")
    .where({ conversation_id: id })
    .orderBy("created_at", "asc")
    .select("id", "direction", "type", "body", "status", "created_at");

  res.json({ messages });
});

/**
 * GET /api/conversations/:id/summary
 * Right pane: customer, latest order, latest payment
 */
inboxRoutes.get("/conversations/:id/summary", async (req, res) => {
  const { id } = req.params;

  const convo = await db("conversations as c")
    .join("customers as u", "u.id", "c.customer_id")
    .where("c.id", id)
    .first("c.id", "c.customer_id", "c.agent_allowed", "u.name", "u.phone", "u.lang");

  if (!convo) return res.status(404).json({ error: "Conversation not found" });

  const order = await db("orders")
    .where({ customer_id: convo.customer_id })
    .orderBy("created_at", "desc")
    .first();

  const payment = order
    ? await db("payments")
        .where({ order_id: order.id })
        .orderBy("created_at", "desc")
        .first()
    : null;

  res.json({
    customer: { name: convo.name, phone: convo.phone, lang: convo.lang },
    delivery: order
      ? { mode: order.delivery_mode, km: order.km, fee_tzs: order.fee_tzs }
      : null,
    payment: payment
      ? {
          id: payment.id,
          method: payment.method,
          status: payment.status,
          recipient: "Ujani Herbals"
        }
      : { status: "awaiting" }
  });
});

/**
 * POST /api/payments/:id/status
 * Body: { status: "verifying" | "paid" | "failed" }
 */
inboxRoutes.post("/payments/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};

  if (!["verifying", "paid", "failed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const existing = await db("payments").where({ id }).first("id");
  if (!existing) return res.status(404).json({ error: "Payment not found" });

  await db("payments").where({ id }).update({ status });

  // emit via socket.io (available via app.set in server.ts)
  req.app.get("io")?.emit("payment.updated", { id, status });

  res.json({ ok: true });
});
