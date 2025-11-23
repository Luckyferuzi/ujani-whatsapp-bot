// backend/src/routes/inbox.ts
import { Router, type Request, type Response } from "express";
import db from "../db/knex.js";
import { sendText } from "../whatsapp.js";
import { emit } from "../sockets.js";
import { getOrdersForCustomer, listOutstandingOrdersForCustomer } from "../db/queries.js";
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

inboxRoutes.get("/conversations", async (req, res) => {
  try {
    // Optional search term: ?q=some text
    const rawSearch =
      typeof req.query.q === "string" ? req.query.q.trim() : "";
    const search = rawSearch.length > 0 ? rawSearch : undefined;

    // Optional unread-only filter: ?unread=1 / true / yes
    let unreadOnly = false;
    const unreadParam = req.query.unread;
    if (typeof unreadParam === "string") {
      const v = unreadParam.toLowerCase();
      unreadOnly = v === "1" || v === "true" || v === "yes";
    }

    // Base: conversations + customer info
    const baseQuery = db("conversations as c")
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

    // Server-side search on name + phone
    if (search) {
      const term = `%${search}%`;
      baseQuery.where((qb) => {
        qb.whereILike("u.name", term).orWhereILike("u.phone", term);
      });
    }

    // Server-side filter: only conversations with unread inbound messages
    if (unreadOnly) {
      baseQuery.whereExists(function () {
        this.select(1)
          .from("messages as m")
          .whereRaw("m.conversation_id = c.id")
          .where("m.direction", "inbound")
          .where(function () {
            this.whereNull("m.status").orWhereNot("m.status", "read");
          });
      });
    }

    const items = await baseQuery;

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
 * Returns: { customer, delivery, payment } for the RIGHT panel
 * - customer: from `customers`
 * - latest order: newest order for that customer
 * - payment: aggregated amounts for that latest order
 */
inboxRoutes.get("/conversations/:id/summary", async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isFinite(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id" });
  }

  try {
    // Conversation + customer
    const conv = await db("conversations as c")
      .leftJoin("customers as u", "u.id", "c.customer_id")
      .where("c.id", conversationId)
      .select(
        "c.customer_id as customer_id",
        "u.name as customer_name",
        "u.phone as customer_phone",
        "u.lang as customer_lang"
      )
      .first();

    if (!conv || !conv.customer_id) {
      return res.json({
        customer: null,
        delivery: null,
        payment: null,
      });
    }

    const customer = {
      name: conv.customer_name ?? null,
      phone: conv.customer_phone ?? "",
      lang: conv.customer_lang ?? "sw",
    };

    // Latest order for this customer
    const order = await db("orders")
      .where({ customer_id: conv.customer_id })
      .orderBy("created_at", "desc")
      .first();

    let delivery: any = null;
    let payment: any = null;

    if (order) {
      const totalTzs = Number(order.total_tzs ?? 0) || 0;

      delivery = {
        mode: order.delivery_mode,
        description: null,
        km: order.km,
        fee_tzs: order.fee_tzs,
      };

      // Latest payment row for that order (we use its amount_tzs as "paid so far")
      const payRow = await db("payments")
        .where({ order_id: order.id })
        .orderBy("created_at", "desc")
        .first();

      const paidAmount = payRow ? Number(payRow.amount_tzs ?? 0) || 0 : 0;
      const remainingAmount =totalTzs - paidAmount;

      payment = {
        id: payRow?.id,
        order_id: order.id,
        method: payRow?.method ?? null,
        recipient: null,
        status: payRow?.status ?? "awaiting",
        amount_tzs: paidAmount,     // total paid so far
        total_tzs: totalTzs,        // order total
        remaining_tzs: remainingAmount, // remaining balance
      };
    }

    return res.json({
      customer,
      delivery,
      payment,
    });
  } catch (err: any) {
    console.error("GET /conversations/:id/summary failed", err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to load summary" });
  }
});


/**
 * GET /api/conversations/:id/orders
 * All orders for the customer behind this conversation
 * Includes aggregated payment info per order.
 */
inboxRoutes.get("/conversations/:id/orders", async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isFinite(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id" });
  }

  try {
    const conv = await db("conversations as c")
      .leftJoin("customers as u", "u.id", "c.customer_id")
      .where("c.id", conversationId)
      .select("c.customer_id", "u.name as customer_name")
      .first();

    if (!conv || !conv.customer_id) {
      return res.json({ items: [] });
    }

    const orders = await db("orders as o")
      .leftJoin("payments as p", "p.order_id", "o.id")
      .where("o.customer_id", conv.customer_id)
      .select(
        "o.id",
        "o.status",
        "o.delivery_mode",
        "o.km",
        "o.fee_tzs",
        "o.total_tzs",
        "o.phone",
        "o.region",
        "o.created_at",
        "o.delivery_agent_phone",
        "o.order_code",
        "p.id as payment_id",
        "p.amount_tzs as paid_amount",
        "p.status as payment_status"
      )
      .orderBy("o.created_at", "desc")
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
 * Body:
 *   {
 *     status: "verifying" | "paid" | "failed",
 *     amount_tzs?: number   // required when status === "paid"
 *   }
 *
 * When status === "paid", we treat amount_tzs as an *additional* installment
 * and keep a running total in payments.amount_tzs.
 */
inboxRoutes.post("/payments/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { status?: string; amount_tzs?: number };

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const status = body.status;
  if (!status || !["verifying", "paid", "failed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const row = await db("payments as p")
      .leftJoin("orders as o", "o.id", "p.order_id")
      .leftJoin("customers as u", "u.id", "o.customer_id")
      .where("p.id", id)
      .select(
        "p.id",
        "p.status as payment_status",
        "p.amount_tzs",
        "p.order_id",
        "o.total_tzs",
        "o.order_code",
        "o.customer_id",
        "u.wa_id",
        "u.lang"
      )
      .first();

    if (!row) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const lang: Lang =
      row.lang === "en" || row.lang === "sw" ? (row.lang as Lang) : "sw";

    let newAmountTotal: number | null = row.amount_tzs ?? null;
    let justAdded: number | null = null;
    const totalOrderAmount: number = Number(row.total_tzs ?? 0) || 0;

    if (status === "paid") {
      const amountFromBody = Number(body.amount_tzs ?? 0);
      if (!Number.isFinite(amountFromBody) || amountFromBody <= 0) {
        return res
          .status(400)
          .json({ error: "amount_tzs is required and must be > 0" });
      }

      const currentTotal = Number(row.amount_tzs ?? 0) || 0;
      newAmountTotal = currentTotal + amountFromBody;
      justAdded = amountFromBody;
    }

    const update: any = { status };
    if (status === "paid" && newAmountTotal != null) {
      update.amount_tzs = newAmountTotal;
    }

    await db("payments").where({ id }).update(update);

    // Let frontend know
    req.app.get("io")?.emit("payment.updated", {
      id,
      status,
      amount_tzs: newAmountTotal,
    });

    // If paid, send message with remaining balance
    if (
      status === "paid" &&
      row.wa_id &&
      row.customer_id &&
      justAdded != null &&
      totalOrderAmount > 0
    ) {
      const remaining = totalOrderAmount - newAmountTotal!; // can be negative

const message = t(lang, "payment.confirm_with_remaining", {
  orderCode: row.order_code || `UJ-${row.order_id}`,
  paid: justAdded.toLocaleString("sw-TZ"),
  paidSoFar: newAmountTotal!.toLocaleString("sw-TZ"),
  remaining: remaining.toLocaleString("sw-TZ"),
  total: totalOrderAmount.toLocaleString("sw-TZ"),
});


      const convo = await db("conversations")
        .where({ customer_id: row.customer_id })
        .orderBy("created_at", "desc")
        .first();

      const conversationId = convo?.id as number | undefined;

      try {
        await sendText(row.wa_id, message);
      } catch (e) {
        console.warn("Failed to send payment confirmation:", e);
      }

      if (conversationId) {
        const [msgRow] = await db("messages")
          .insert({
            conversation_id: conversationId,
            direction: "out",
            type: "text",
            body: message,
            status: "sent",
          })
          .returning("*");

        req.app.get("io")?.emit("message.created", {
          conversation_id: conversationId,
          message: msgRow,
        });
      }
    }

    return res.json({
      ok: true,
      amount_tzs: newAmountTotal,
    });
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

// GET /api/orders
// Query params (all optional):
//   q          → search by customer name, phone, or order_code
//   phone      → filter by customer phone (used when coming from a chat)
//   status     → filter by order status
//   product    → filter by product name or SKU
//   min_total  → minimum total_tzs
//   max_total  → maximum total_tzs
//   limit      → max rows (default 100, max 200)
inboxRoutes.get("/orders", async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === "string" && !Number.isNaN(Number(limitRaw))
        ? Math.min(200, Number(limitRaw))
        : 100;

    const search =
      typeof req.query.q === "string" && req.query.q.trim().length > 0
        ? req.query.q.trim()
        : undefined;

    const status =
      typeof req.query.status === "string" && req.query.status.trim().length > 0
        ? req.query.status.trim()
        : undefined;

    const product =
      typeof req.query.product === "string" &&
      req.query.product.trim().length > 0
        ? req.query.product.trim()
        : undefined;

    const phoneFilter =
      typeof req.query.phone === "string" && req.query.phone.trim().length > 0
        ? req.query.phone.trim()
        : undefined;

    const minTotalRaw =
      typeof req.query.min_total === "string" ? req.query.min_total : undefined;
    const maxTotalRaw =
      typeof req.query.max_total === "string" ? req.query.max_total : undefined;

    const qb = db("orders as o")
      .leftJoin("customers as u", "u.id", "o.customer_id")
      .leftJoin("payments as p", "p.order_id", "o.id")
      .select(
        "o.id",
        "o.status",
        "o.delivery_mode",
        "o.km",
        "o.fee_tzs",
        "o.total_tzs",
        "o.phone as order_phone",
        "o.region",
        "o.created_at",
        "o.delivery_agent_phone",
        "o.order_code",
        "u.name as customer_name",
        "u.phone as customer_phone",
        "p.id as payment_id",
        "p.amount_tzs as paid_amount",
        "p.status as payment_status"
      )
      .orderBy("o.created_at", "desc")
      .limit(limit);

    if (search) {
      const term = `%${search}%`;
      qb.where(function () {
        this.where("u.name", "ilike", term)
          .orWhere("u.phone", "ilike", term)
          .orWhere("o.order_code", "ilike", term);
      });
    }

    if (phoneFilter) {
      const term = `%${phoneFilter}%`;
      qb.where(function () {
        this.where("u.phone", "ilike", term).orWhere("o.phone", "ilike", term);
      });
    }

    if (status) {
      qb.where("o.status", status);
    }

    if (typeof minTotalRaw === "string") {
      const n = Number(minTotalRaw);
      if (Number.isFinite(n)) {
        qb.where("o.total_tzs", ">=", n);
      }
    }

    if (typeof maxTotalRaw === "string") {
      const n = Number(maxTotalRaw);
      if (Number.isFinite(n)) {
        qb.where("o.total_tzs", "<=", n);
      }
    }

    if (product) {
      const term = `%${product}%`;
      qb.whereExists(function () {
        this.select(1)
          .from("order_items as oi")
          .whereRaw("oi.order_id = o.id")
          .where(function () {
            this.where("oi.name", "ilike", term).orWhere(
              "oi.sku",
              "ilike",
              term
            );
          });
      });
    }

    const rows = await qb;

    const items = (rows as any[]).map((row) => ({
      id: row.id,
      status: row.status,
      delivery_mode: row.delivery_mode,
      km: row.km,
      fee_tzs: row.fee_tzs,
      total_tzs: row.total_tzs,
      phone: row.order_phone ?? row.customer_phone ?? null,
      region: row.region,
      created_at: row.created_at,
      delivery_agent_phone: row.delivery_agent_phone,
      order_code: row.order_code,
      customer_name: row.customer_name ?? null,
      payment_id: row.payment_id ?? null,
      paid_amount: row.paid_amount ?? null,
      payment_status: row.payment_status ?? null,
    }));

    return res.json({ items });
  } catch (err: any) {
    console.error("[GET /api/orders] failed", err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to load orders" });
  }
});


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

    // Notify customer via WhatsApp
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

// PATCH /api/orders/:id  -> edit basic order fields
inboxRoutes.patch("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const allowed = [
    "delivery_mode",
    "region",
    "phone",
    "km",
    "fee_tzs",
    "total_tzs",
  ];
  const patch: Record<string, any> = {};
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key];
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "no_updates" });
  }

  patch["updated_at"] = new Date();

  await db("orders").where({ id }).update(patch);
  return res.json({ ok: true });
});

// POST /api/orders/:id/cancel  -> explicit cancel
inboxRoutes.post("/orders/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  await db("orders").where({ id }).update({
    status: "cancelled",
    updated_at: new Date(),
  });

  return res.json({ ok: true });
});

// DELETE /api/orders/:id  -> soft delete (set deleted_at)
inboxRoutes.delete("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  await db("orders").where({ id }).update({
    deleted_at: new Date(),
  });

  return res.json({ ok: true });
});


// GET /api/customers/:customerId/outstanding-orders
inboxRoutes.get(
  "/customers/:customerId/outstanding-orders",
  async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (!Number.isFinite(customerId)) {
      return res.status(400).json({ error: "invalid_customer" });
    }

    const items = await listOutstandingOrdersForCustomer(customerId);
    return res.json({ items });
  }
);

// ---------------------------------------------------------------------------
// Products CRUD for admin UI
// ---------------------------------------------------------------------------

// GET /api/products  -> list all products for admin
// ---------------------------------------------------------------------------
// Products CRUD for admin UI (bilingual descriptions)
// ---------------------------------------------------------------------------

// GET /api/products  -> list all products for admin
inboxRoutes.get("/products", async (req, res) => {
  try {
    const rows = await db("products")
      .orderBy("created_at", "desc")
      .select(
        "id",
        "sku",
        "name",
        "price_tzs",
        "short_description",
        "short_description_en",
        "description",
        "description_en",
        "is_installment",
        "is_active",
        "created_at"
      );

    return res.json({ items: rows });
  } catch (err: any) {
    console.error("GET /products failed", err);
    return res.status(500).json({ error: "Failed to load products" });
  }
});

// GET /api/products/:id  -> single product (for editing)
inboxRoutes.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  try {
    const product = await db("products").where({ id }).first();
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json({ product });
  } catch (err: any) {
    console.error("GET /products/:id failed", err);
    return res.status(500).json({ error: "Failed to load product" });
  }
});

// POST /api/products  -> create new product
inboxRoutes.post("/products", async (req, res) => {
  try {
    const {
      sku,
      name,
      price_tzs,
      short_description,
      short_description_en,
      description,
      description_en,
      is_installment,
      is_active,
    } = req.body ?? {};

    const priceNumeric = Number(price_tzs);

    if (
      !sku ||
      !name ||
      !short_description ||
      !Number.isFinite(priceNumeric) ||
      priceNumeric <= 0
    ) {
      return res.status(400).json({
        error:
          "Please provide SKU, product name, short description (Swahili) and a positive price.",
      });
    }

    const [inserted] = await db("products")
      .insert({
        sku: String(sku).trim(),
        name: String(name).trim(),
        price_tzs: priceNumeric,
        short_description: String(short_description).trim(), // SW (required)
        short_description_en: short_description_en
          ? String(short_description_en).trim()
          : null,
        description: description ? String(description).trim() : "",
        description_en: description_en
          ? String(description_en).trim()
          : null,
        usage_instructions: "",
        warnings: "",
        is_installment: !!is_installment,
        is_active: is_active === false ? false : true,
      })
      .returning("*");

    return res.json({ product: inserted });
  } catch (err: any) {
    console.error("POST /products failed", err);
    if (err?.code === "23505") {
      return res.status(400).json({ error: "SKU already exists" });
    }
    return res.status(500).json({ error: "Failed to create product" });
  }
});


// PUT /api/products/:id  -> update existing product
inboxRoutes.put("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  try {
    const {
      sku,
      name,
      price_tzs,
      short_description,
      short_description_en,
      description,
      description_en,
      is_installment,
      is_active,
    } = req.body ?? {};

    const patch: Record<string, any> = {};
    if (sku !== undefined) patch.sku = String(sku).trim();
    if (name !== undefined) patch.name = String(name).trim();
    if (price_tzs !== undefined) patch.price_tzs = Number(price_tzs);
    if (short_description !== undefined)
      patch.short_description = String(short_description).trim();
    if (short_description_en !== undefined)
      patch.short_description_en = short_description_en
        ? String(short_description_en).trim()
        : null;
    if (description !== undefined)
      patch.description = description ? String(description).trim() : "";
    if (description_en !== undefined)
      patch.description_en = description_en
        ? String(description_en).trim()
        : null;
    if (is_installment !== undefined)
      patch.is_installment = !!is_installment;
    if (is_active !== undefined) patch.is_active = !!is_active;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    patch.updated_at = new Date();

    const [updated] = await db("products")
      .where({ id })
      .update(patch)
      .returning("*");

    if (!updated) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.json({ product: updated });
  } catch (err: any) {
    console.error("PUT /products/:id failed", err);
    if (err?.code === "23505") {
      return res.status(400).json({ error: "SKU already exists" });
    }
    return res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE /api/products/:id  -> soft delete (mark inactive)
inboxRoutes.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  try {
    const [updated] = await db("products")
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning("*");

    if (!updated) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /products/:id failed", err);
    return res.status(500).json({ error: "Failed to delete product" });
  }
});

