// backend/src/routes/inbox.ts
import { Router, type Request, type Response } from "express";
import db from "../db/knex.js";
import { sendText } from "../whatsapp.js";
import { emit } from "../sockets.js";
import { getOrdersForCustomer } from "../db/queries.js";
import { t, Lang } from "../i18n.js";


export const inboxRoutes = Router();

function formatTzs(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  return Math.floor(amount).toLocaleString("sw-TZ");
}

/**
 * GET /api/conversations
 * Left pane list (like WhatsApp)
 */

inboxRoutes.get("/conversations", async (_req, res) => {
  try {
    // Base: conversations + customer info
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

    // Last message text per conversation
    const msgRows = await db("messages")
      .whereIn("conversation_id", convoIds)
      .orderBy("created_at", "asc")
      .select("conversation_id", "body", "created_at");

    const metaByConvo: Record<number, { last_message_text: string | null }> =
      {};

    for (const m of msgRows) {
      const cid = m.conversation_id as number;
      if (!metaByConvo[cid]) {
        metaByConvo[cid] = { last_message_text: null };
      }
      if (m.body && m.body.trim().length > 0) {
        // ascending order ⇒ this ends up as the latest non-empty
        metaByConvo[cid].last_message_text = m.body;
      }
    }

    // unread_count = inbound messages that are not yet read
    for (const row of items) {
      const unreadRow = await db("messages")
        .where({ conversation_id: row.id, direction: "inbound" })
        .where((qb) => {
          qb.whereNull("status").orWhereNot("status", "read");
        })
        .count<{ count: string }>("id as count")
        .first();

      const meta = metaByConvo[row.id as number] ?? {
        last_message_text: null,
      };

      (row as any).unread_count = Number(unreadRow?.count ?? 0);
      (row as any).last_message_text = meta.last_message_text;
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
      const totalTzs = Number(order.total_tzs ?? 0);

      delivery = {
        // match actual DB columns
        mode: order.delivery_mode, // e.g. "delivery" | "pickup"
        description: null, // optional human text later
        km: order.km,
        fee_tzs: order.fee_tzs,
      };

      // 3) Aggregated payment for that order (single row)
      const payRow = await db("payments")
        .where({ order_id: order.id })
        .orderBy("created_at", "desc")
        .first();

      if (payRow) {
        const paidAmount = Number(payRow.amount_tzs ?? 0);
        const remainingAmount = Math.max(0, totalTzs - paidAmount);

        payment = {
          id: payRow.id,
          order_id: order.id,
          method: payRow.method,
          status: payRow.status ?? "awaiting",
          recipient: null,
          amount_tzs: paidAmount || null,
          total_tzs: totalTzs || null,
          remaining_tzs: remainingAmount || null,
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
/**
 * GET /api/conversations/:id/orders
 * All orders for the customer behind this conversation
 * (each item also carries the customer_name for clarity)
 */
inboxRoutes.get("/conversations/:id/orders", async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isFinite(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id" });
  }

  try {
    // Find the conversation, its customer id, and the customer name
    const conv = await db("conversations as c")
      .leftJoin("customers as u", "u.id", "c.customer_id")
      .where("c.id", conversationId)
      .select("c.customer_id", "u.name as customer_name")
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
        // "order_code" // uncomment if you add this column to the select
      )
      .orderBy("created_at", "desc")
      .limit(50);

    const items = (orders as any[]).map((row) => ({
      ...row,
      customer_name: conv.customer_name ?? null,
    }));

    res.json({ items });
  } catch (err: any) {
    console.error("orders history error:", err);
    res
      .status(500)
      .json({ error: err?.message || "Failed to load orders history" });
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

// ==============================
// POST /api/conversations/:id/read
// Mark all inbound delivered messages as read
// ==============================
// ==============================
// POST /api/conversations/:id/read
// Mark all inbound messages as read
// ==============================
inboxRoutes.post("/conversations/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid conversation id" });
  }

  try {
    await db("messages")
      .where({ conversation_id: id, direction: "inbound" })
      .update({ status: "read" });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("POST /conversations/:id/read failed", err);
    res
      .status(500)
      .json({ error: err?.message ?? "Failed to mark as read" });
  }
});

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
/**
 * POST /api/payments/:id/status
 *
 * Body:
 *   {
 *     status: "verifying" | "paid" | "failed",
 *     amount_tzs?: number  // required when status === "paid" (this is the new payment chunk)
 *   }
 */
inboxRoutes.post("/payments/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status, amount_tzs } = req.body ?? {};

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  if (!["verifying", "paid", "failed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    // Get payment + order + customer
    const payment = await db("payments as p")
      .leftJoin("orders as o", "o.id", "p.order_id")
      .leftJoin("customers as u", "u.id", "o.customer_id")
      .where("p.id", id)
      .select(
        "p.id",
        "p.status",
        "p.amount_tzs",
        "p.order_id",
        "o.total_tzs",
        "o.order_code",
        "o.customer_id",
        "u.wa_id",
        "u.lang"
      )
      .first();

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    let newAmountTotal = Number(payment.amount_tzs ?? 0);
    let justAdded = 0;

    // When marking as "paid", we treat amount_tzs as an *extra installment*.
    if (status === "paid") {
      const delta = Number(amount_tzs);
      if (!Number.isFinite(delta) || delta <= 0) {
        return res.status(400).json({
          error:
            "amount_tzs must be a positive number when marking payment as paid",
        });
      }
      justAdded = Math.floor(delta);
      newAmountTotal = Math.floor(Number(payment.amount_tzs ?? 0) + justAdded);
    }

    const update: any = { status };
    if (status === "paid") {
      update.amount_tzs = newAmountTotal;
    }

    await db("payments").where({ id }).update(update);

    // Emit to UI (for RightPanel refresh)
    req.app.get("io")?.emit("payment.updated", {
      id,
      status,
      amount_tzs: status === "paid" ? newAmountTotal : payment.amount_tzs,
    });

    // If paid: send confirmation message to customer + store outbound message
    if (
      status === "paid" &&
      payment.wa_id &&
      payment.customer_id &&
      payment.order_id
    ) {
      const totalOrderAmount = Math.floor(Number(payment.total_tzs ?? 0));
      const paidSoFar = Math.floor(newAmountTotal);
      const remainingAmount = Math.max(0, totalOrderAmount - paidSoFar);

      const lang: Lang = (payment.lang === "en" || payment.lang === "sw"
        ? payment.lang
        : "sw") as Lang;

      const orderCode =
        payment.order_code || `UJ-${payment.order_id as number}`;

      const msg = t(lang, "payment.confirm_with_remaining", {
        orderCode,
        paid: formatTzs(justAdded),
        paidSoFar: formatTzs(paidSoFar),
        remaining: formatTzs(remainingAmount),
        total: formatTzs(totalOrderAmount),
      });

      // Find the most recent conversation for this customer
      const convo = await db("conversations")
        .where({ customer_id: payment.customer_id })
        .orderBy("created_at", "desc")
        .first();

      const conversationId = convo?.id as number | undefined;

      try {
        await sendText(payment.wa_id, msg);
      } catch (e) {
        console.warn("Failed to send payment confirmation:", e);
      }

      if (conversationId) {
        const [msgRow] = await db("messages")
          .insert({
            conversation_id: conversationId,
            direction: "out",
            type: "text",
            body: msg,
            status: "sent",
          })
          .returning("*");

        req.app.get("io")?.emit("message.created", {
          conversation_id: conversationId,
          message: msgRow,
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
// POST /api/orders/:id/status
// Body:
//   {
//     status: "pending" | "preparing" | "out_for_delivery" | "delivered" | "cancelled",
//     delivery_agent_phone?: string // required when status === "out_for_delivery"
//   }
// POST /api/orders/:id/status
// Body:
//   {
//     status: "pending" | "preparing" | "out_for_delivery" | "delivered" | "cancelled",
//     delivery_agent_phone?: string // required when status === "out_for_delivery"
//   }
inboxRoutes.post("/orders/:id/status", async (req, res) => {
  const id = Number(req.params.id);

  const body = req.body as {
    status?: string;
    delivery_agent_phone?: string;
  };

  const status = body.status;
  let deliveryAgentPhone: string | undefined = body.delivery_agent_phone;

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

  if (status === "out_for_delivery") {
    if (
      !deliveryAgentPhone ||
      typeof deliveryAgentPhone !== "string" ||
      deliveryAgentPhone.trim().length < 4
    ) {
      return res.status(400).json({
        error:
          "delivery_agent_phone is required when marking order as out_for_delivery",
      });
    }
    // Clean it up once and store
    deliveryAgentPhone = deliveryAgentPhone.trim();
  }

  try {
    const update: any = { status };
    if (status === "out_for_delivery" && deliveryAgentPhone) {
      update.delivery_agent_phone = deliveryAgentPhone;
    }

    const [order] = await db("orders")
      .where({ id })
      .update(update)
      .returning("*");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Notify customer via WhatsApp when certain statuses are set
    if (order.customer_id) {
      const customer = await db("customers")
        .where({ id: order.customer_id })
        .first();

      const waId = customer?.wa_id as string | undefined;
      const lang: Lang = (customer?.lang === "en" || customer?.lang === "sw"
        ? customer.lang
        : "sw") as Lang;

      const orderCode = order.order_code || `UJ-${order.id}`;
      let msg: string | null = null;

      if (status === "preparing") {
        msg = t(lang, "order.preparing_message", { orderCode });
      } else if (status === "out_for_delivery") {
        const phoneForMsg =
          deliveryAgentPhone ??
          ((order.delivery_agent_phone as string | undefined) ?? "");
        msg = t(lang, "order.out_for_delivery_message", {
          orderCode,
          deliveryAgentPhone: phoneForMsg,
        });
      } else if (status === "delivered") {
        msg = t(lang, "order.delivered_message", { orderCode });
      }

      if (waId && msg) {
        // Find latest conversation to log the outbound message
        const convo = await db("conversations")
          .where({ customer_id: order.customer_id })
          .orderBy("created_at", "desc")
          .first();

        const conversationId = convo?.id as number | undefined;

        try {
          await sendText(waId, msg);
        } catch (e) {
          console.warn("Failed to send order status message:", e);
        }

        if (conversationId) {
          const [msgRow] = await db("messages")
            .insert({
              conversation_id: conversationId,
              direction: "out",
              type: "text",
              body: msg,
              status: "sent",
            })
            .returning("*");

          req.app.get("io")?.emit("message.created", {
            conversation_id: conversationId,
            message: msgRow,
          });
        }
      }
    }

    return res.json({ order });
  } catch (err: any) {
    console.error("POST /orders/:id/status failed", err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to update order status" });
  }
});

