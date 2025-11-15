// backend/src/routes/inbox.ts
import { Router } from "express";
import db from "../db/knex.js";
import { sendText } from "../whatsapp.js";

export const inboxRoutes = Router();

/**
 * GET /api/conversations
 * Left pane list (like WhatsApp)
 */
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
 * Full message history for a conversation
 */
// GET /api/conversations/:id/messages
inboxRoutes.get("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const items = await db("messages")
    .where({ conversation_id: id })
    .select("id", "conversation_id", "direction", "type", "body", "status", "created_at")
    .orderBy("created_at", "asc")
    .limit(500);

  res.json({ items });
});

/**
 * GET /api/conversations/:id/summary
 * Customer + delivery + payment summary for right panel
 */
// ==============================
// GET /api/conversations/:id/summary
// ==============================
// backend/src/routes/inbox.ts

inboxRoutes.get("/conversations/:id/summary", async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isFinite(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id" });
  }

  try {
    // 1) Conversation + customer
    const conv = await db("conversations as c")
      .leftJoin("customers as u", "u.id", "c.customer_id")
      .where("c.id", conversationId)
      .select(
        "c.customer_id as c_customer_id",
        "u.name as customer_name",
        "u.phone as customer_phone",
        "u.lang as customer_lang"
      )
      .first();

    if (!conv) {
      // No such conversation – nothing to show
      return res.json({
        customer: null,
        delivery: null,
        payment: null,
      });
    }

    const customer =
      conv.customer_phone || conv.customer_name
        ? {
            name: conv.customer_name,
            phone: conv.customer_phone,
            lang: conv.customer_lang,
          }
        : null;

    // 2) Latest order for that customer (if any)
    const order = await db("orders")
      .where({ customer_id: conv.c_customer_id })
      .orderBy("created_at", "desc")
      .first();

    let delivery: any = null;
    let payment: any = null;

    if (order) {
      delivery = {
        // match actual DB columns
        mode: order.delivery_mode, // e.g. "delivery" | "pickup"
        description: null, // you can later build a human string if you want
        km: order.km,
        fee_tzs: order.fee_tzs,
      };

      // 3) Latest payment for that order (if any)
      const payRow = await db("payments")
        .where({ order_id: order.id })
        .orderBy("created_at", "desc")
        .first();

      if (payRow) {
        payment = {
          id: payRow.id,
          method: payRow.method,
          status: payRow.status,
          // these fields don't exist in your schema yet,
          // so we just send null so the UI can handle it.
          recipient: null,
          amount_tzs: null,
        };
      }
    }

    res.json({
      customer,
      delivery,
      payment,
    });
  } catch (err: any) {
    console.error("summary error:", err);
    res
      .status(500)
      .json({ error: err?.message || "Failed to load conversation summary" });
  }
});

// Allow or disallow agent replies for a conversation
// POST /api/conversations/:id/agent-allow
inboxRoutes.post("/conversations/:id/agent-allow", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const raw = req.body?.agent_allowed ?? req.body?.allowed;
    const agentAllowed = !!raw;

    // Update DB
    await db("conversations")
      .where({ id })
      .update({ agent_allowed: agentAllowed });

    // Notify sockets so UI updates in real-time
    emit("conversation.updated", { id, agent_allowed: agentAllowed });

    res.json({ ok: true, agent_allowed: agentAllowed });
  } catch (err: any) {
    console.error("agent-allow error:", err);
    res
      .status(500)
      .json({ error: err?.message || "Failed to update agent mode" });
  }
});


/**
 * POST /api/payments/:id/status
 * { status: "verifying" | "paid" | "failed" }
 *
 * - updates DB
 * - emits socket event payment.updated
 * - when status === "paid", sends WhatsApp confirmation to customer
 */
inboxRoutes.post("/payments/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body ?? {};

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  if (!["verifying", "paid", "failed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const payment = await db("payments as p")
      .leftJoin("orders as o", "o.id", "p.order_id")
      .leftJoin("conversations as c", "c.id", "o.conversation_id")
      .leftJoin("customers as u", "u.id", "c.customer_id")
      .where("p.id", id)
      .select(
        "p.id",
        "p.status",
        "p.amount_tzs",
        "p.order_id",
        "c.id as conversation_id",
        "u.wa_id",
        "u.lang"
      )
      .first();

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    await db("payments").where({ id }).update({ status });

    // Emit to UI (for RightPanel refresh)
    req.app.get("io")?.emit("payment.updated", { id, status });

    // If paid: send confirmation message to customer + store outbound message
    if (status === "paid" && payment.wa_id && payment.conversation_id) {
      const msg =
        "Tumepokea malipo. Order yako inaandaliwa. Asante kwa kununua bidhaa zetu 🌿";

      try {
        await sendText(payment.wa_id, msg);
      } catch (e) {
        console.warn("Failed to send payment confirmation:", e);
      }

      await db("messages").insert({
        conversation_id: payment.conversation_id,
        direction: "out",
        type: "text",
        body: msg,
        status: "sent",
      });

      req.app.get("io")?.emit("message.created", {
        conversation_id: payment.conversation_id,
      });
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error("POST /payments/:id/status failed", e);
    res.status(500).json({ error: e?.message ?? "failed" });
  }
});
function emit(arg0: string, arg1: { id: number; agent_allowed: boolean; }) {
  throw new Error("Function not implemented.");
}

