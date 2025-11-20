// backend/src/routes/inbox.ts
import { Router, type Request, type Response } from "express";
import db from "../db/knex.js";
import { sendText } from "../whatsapp.js";
import { emit } from "../sockets.js";
import { getOrdersForCustomer } from "../db/queries.js";



export const inboxRoutes = Router();

/**
 * GET /api/conversations
 * Left pane list (like WhatsApp)
 */
/**
 * GET /api/conversations
 * Left pane list
 */
// GET /api/conversations
// ==============================
// GET /api/conversations
// Left pane list (like WhatsApp)
// ==============================
inboxRoutes.get("/conversations", async (_req, res) => {
  try {
    // Base list: conversations + customer info
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

    if (items.length === 0) {
      return res.json({ items: [] });
    }

    const convoIds = items.map((row: any) => row.id as number);

    // Gather messages for meta info: last message text + total message count
    const msgRows = await db("messages")
      .whereIn("conversation_id", convoIds)
      .orderBy("created_at", "asc")
      .select("conversation_id", "body", "created_at");

    const metaByConvo: Record<
      number,
      { last_message_text: string | null; message_count: number }
    > = {};

    for (const m of msgRows) {
      const cid = m.conversation_id as number;
      if (!metaByConvo[cid]) {
        metaByConvo[cid] = { last_message_text: null, message_count: 0 };
      }
      metaByConvo[cid].message_count += 1;
      if (m.body && m.body.trim().length > 0) {
        // Because we iterate ascending by created_at,
        // this will end up as the last non-empty message body.
        metaByConvo[cid].last_message_text = m.body;
      }
    }

    // Add unread_count + meta to each row
    for (const row of items) {
      // unread messages from customer (direction=in, status=delivered)
      const unreadRow = await db("messages")
        .where({
          conversation_id: row.id,
          direction: "in",
          status: "delivered",
        })
        .count<{ count: string }>("id as count")
        .first();

      (row as any).unread_count = Number(unreadRow?.count ?? 0);

      const meta = metaByConvo[row.id as number] ?? {
        last_message_text: null,
        message_count: 0,
      };
      (row as any).last_message_text = meta.last_message_text;
      (row as any).message_count = meta.message_count;
    }

    res.json({ items });
  } catch (err: any) {
    console.error("GET /conversations failed", err);
    res
      .status(500)
      .json({ error: err?.message ?? "Failed to list conversations" });
  }
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

/**
 * GET /api/conversations/:id/orders
 * All orders for the customer behind this conversation
 */
inboxRoutes.get("/conversations/:id/orders", async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isFinite(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id" });
  }

  try {
    // Find the conversation and its customer
    const conv = await db("conversations")
      .where({ id: conversationId })
      .select("customer_id")
      .first();

    if (!conv || !conv.customer_id) {
      return res.json({ items: [] });
    }

    const orders = await db("orders")
      .where({ customer_id: conv.customer_id })
      .select(
        "id",
        "status",
        "delivery_mode",
        "km",
        "fee_tzs",
        "total_tzs",
        "phone",
        "region",
        "created_at"
        // If later you add an order_code column:
        // "order_code"
      )
      .orderBy("created_at", "desc")
      .limit(50);

    res.json({ items: orders });
  } catch (err: any) {
    console.error("orders history error:", err);
    res
      .status(500)
      .json({ error: err?.message || "Failed to load order history" });
  }
});


// DELETE /api/conversations/:id/messages
// ?mediaOnly=1 → only delete media (image/document/audio/video)
inboxRoutes.delete("/conversations/:id/messages", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const mediaOnly =
      req.query.mediaOnly === "1" || req.query.mediaOnly === "true";

    if (mediaOnly) {
      await db("messages")
        .where({ conversation_id: id })
        .whereIn("type", ["image", "document", "audio", "video"])
        .del();
    } else {
      await db("messages").where({ conversation_id: id }).del();
    }

    // Optionally notify frontend via sockets
    req.app.get("io")?.emit("conversation.cleared", {
      conversation_id: id,
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /conversations/:id/messages failed", err);
    res.status(500).json({ error: err?.message ?? "failed" });
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
    // Get payment + order + customer (no conversation_id / amount_tzs here)
    const payment = await db("payments as p")
      .leftJoin("orders as o", "o.id", "p.order_id")
      .leftJoin("customers as u", "u.id", "o.customer_id")
      .where("p.id", id)
      .select(
        "p.id",
        "p.status",
        "p.order_id",
        "o.customer_id",
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
    if (status === "paid" && payment.wa_id && payment.customer_id) {
      // Find the most recent conversation for this customer
      const convo = await db("conversations")
        .where({ customer_id: payment.customer_id })
        .orderBy("created_at", "desc")
        .first();

      const conversationId = convo?.id as number | undefined;

      const msg =
        "Tumepokea malipo. Order yako inaandaliwa. Asante kwa kununua bidhaa zetu 🌿";

      try {
        await sendText(payment.wa_id, msg);
      } catch (e) {
        console.warn("Failed to send payment confirmation:", e);
      }

      if (conversationId) {
        await db("messages").insert({
          conversation_id: conversationId,
          direction: "out",
          type: "text",
          body: msg,
          status: "sent",
        });

        req.app.get("io")?.emit("message.created", {
          conversation_id: conversationId,
        });
      }
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error("POST /payments/:id/status failed", e);
    res.status(500).json({ error: e?.message ?? "failed" });
  }
});

inboxRoutes.get(
  "/customers/:customerId/orders",
  async (req: Request, res: Response) => {

    try {
      const customerId = Number(req.params.customerId);
      if (!Number.isFinite(customerId)) {
        return res.status(400).json({ error: "invalid customerId" });
      }

      const limit = req.query.limit
        ? Math.min(100, Number(req.query.limit))
        : 20;

      const orders = await getOrdersForCustomer(customerId, limit);

      return res.json({ orders });
    } catch (err) {
      console.error("[GET /api/customers/:customerId/orders] failed", err);
      return res.status(500).json({ error: "internal_error" });
    }
  }
);

// POST /api/orders/:id/status
// Body: { status: "pending" | "preparing" | "out_for_delivery" | "delivered" | "cancelled" }
inboxRoutes.post("/orders/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status?: string };

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  const allowed = [
    "pending",
    "preparing",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const [order] = await db("orders")
      .where({ id })
      .update({ status })
      .returning("*");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ order });
  } catch (err: any) {
    console.error("POST /orders/:id/status failed", err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to update order status" });
  }
});
