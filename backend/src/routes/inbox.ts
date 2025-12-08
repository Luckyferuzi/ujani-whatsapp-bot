// backend/src/routes/inbox.ts
import e, { Router, type Request, type Response } from "express";
import db from "../db/knex.js";
import { sendText, downloadMedia } from "../whatsapp.js";
import { emit } from "../sockets.js";
import { getOrdersForCustomer, listOutstandingOrdersForCustomer, createOrderWithPayment, createManualOrderFromSkus, insertOutboundMessage } from "../db/queries.js";
import { t, Lang } from "../i18n.js";
import { z } from "zod";


export const inboxRoutes = Router();

const updateOrderStatusSchema = z.object({
  status: z.enum([
    "pending",
    "preparing",
    "verifying",
    "out_for_delivery",
    "delivered",
    "cancelled",
    // NOTE: "failed" intentionally NOT allowed here anymore
  ]),
  delivery_agent_phone: z.string().trim().optional(),
});

// Serve WhatsApp media to the admin UI
inboxRoutes.get("/media/:mediaId", async (req, res) => {
  const mediaId = req.params.mediaId;
  if (!mediaId) {
    return res.status(400).json({ error: "Missing mediaId" });
  }

  try {
    const { buffer, contentType } = await downloadMedia(mediaId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(buffer);
  } catch (err: any) {
    console.error("GET /media/:mediaId failed", err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to download media" });
  }
});

// DELETE /api/messages/:id
// Only allow deleting media-type messages from the admin UI
inboxRoutes.delete("/messages/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid message id" });
  }

  try {
    const msg = await db("messages")
      .where({ id })
      .select("id", "conversation_id", "type")
      .first();

    if (!msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Only allow media messages to be deleted for now
    if (
      msg.type !== "image" &&
      msg.type !== "video" &&
      msg.type !== "audio" &&
      msg.type !== "document"
    ) {
      return res
        .status(400)
        .json({ error: "Only media messages can be deleted" });
    }

    await db("messages").where({ id }).del();

    // Let connected clients know this message is gone (optional)
    req.app.get("io")?.emit("message.deleted", {
      id: msg.id,
      conversation_id: msg.conversation_id,
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/messages/:id failed", err);
    res
      .status(500)
      .json({ error: err?.message ?? "Failed to delete message" });
  }
});


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
      // initial sort (we'll do final sort in-memory)
      .orderBy("c.last_user_message_at", "desc")
      .limit(100);

    if (items.length === 0) {
      return res.json({ items: [] });
    }

    const convoIds = items.map((row: any) => row.id as number);

    // Last messages (both inbound + outbound)
    const msgRows = await db("messages")
      .whereIn("conversation_id", convoIds)
      .orderBy("created_at", "asc")
      .select("conversation_id", "body", "created_at");

    const metaByConvo: Record<
      number,
      { last_message_text: string | null; last_message_at: string | null }
    > = {};

    for (const m of msgRows) {
      const cid = m.conversation_id as number;
      if (!metaByConvo[cid]) {
        metaByConvo[cid] = { last_message_text: null, last_message_at: null };
      }
      if (m.body && m.body.trim().length > 0) {
        // ascending order ⇒ this ends up as the latest non-empty
        metaByConvo[cid].last_message_text = m.body;
      }
      // always update last_message_at to the latest created_at
      metaByConvo[cid].last_message_at = m.created_at as string;
    }

    // unread_count = inbound messages that are not yet read
    for (const row of items as any[]) {
      const unreadRow = await db("messages")
        .where({ conversation_id: row.id, direction: "inbound" })
        .where((qb) => {
          qb.whereNull("status").orWhereNot("status", "read");
        })
        .count<{ count: string }>("id as count")
        .first();

      const meta = metaByConvo[row.id as number] ?? {
        last_message_text: null,
        last_message_at: null,
      };

      row.unread_count = Number(unreadRow?.count ?? 0);
      row.last_message_text = meta.last_message_text;
      row.last_message_at =
        meta.last_message_at ?? row.last_user_message_at ?? null;
    }

    // Final sort by last activity (incoming OR outgoing)
    (items as any[]).sort((a, b) => {
      const aTime = new Date(
        a.last_message_at ?? a.last_user_message_at ?? 0
      ).getTime();
      const bTime = new Date(
        b.last_message_at ?? b.last_user_message_at ?? 0
      ).getTime();
      return bTime - aTime;
    });

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
// GET /api/orders
inboxRoutes.get("/orders", async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.page_size ?? req.query.limit;
    const pageRaw = req.query.page;

    const page =
      typeof pageRaw === "string" && !Number.isNaN(Number(pageRaw))
        ? Math.max(1, Number(pageRaw))
        : 1;

    const pageSize =
      typeof limitRaw === "string" && !Number.isNaN(Number(limitRaw))
        ? Math.min(200, Math.max(1, Number(limitRaw))) // max 200 per page
        : 50; // default

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
    .whereNull("o.deleted_at")
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

       // 1) Count total matching rows
    const countRow = await qb
      .clone()
      .clearSelect()
      .clearOrder()
      .countDistinct<{ total: string }[]>("o.id as total")
      .first();

    const total = Number(countRow?.total ?? 0);

    // 2) Fetch one page
    const rows = await qb
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
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items = rows.map((row) => ({
      id: row.id,
      status: row.status,
      delivery_mode: row.delivery_mode,
      km: row.km,
      fee_tzs: row.fee_tzs,
      total_tzs: row.total_tzs,
      phone: row.order_phone ?? row.customer_phone ?? null,
      region: row.region ?? null,
      created_at: row.created_at,
      delivery_agent_phone: row.delivery_agent_phone ?? null,
      order_code: row.order_code ?? null,
      customer_name: row.customer_name ?? null,
      paid_amount: row.paid_amount ?? null,
      payment_status: row.payment_status ?? null,
    }));

    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;

    return res.json({ items, total, page, pageSize, totalPages });

  } catch (err: any) {
    console.error("[GET /api/orders] failed", err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to load orders" });
  }
});

// GET /api/orders/:id/items  -> list products in a specific order
inboxRoutes.get("/orders/:id/items", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  try {
    const rows = await db("order_items")
      .where({ order_id: id })
      .select("sku", "name", "qty", "unit_price_tzs");

    return res.json({ items: rows });
  } catch (err: any) {
    console.error("[GET /api/orders/:id/items] failed", err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to load order items" });
  }
});

// POST /api/orders/manual  -> create manual order with multiple products
inboxRoutes.post("/orders/manual", async (req, res) => {
  try {
    const {
      customer_name,
      phone,
      location_type,
      region,
      delivery_mode,
      items,
    } = req.body as {
      customer_name?: string;
      phone?: string;
      location_type?: "within" | "outside";
      region?: string;
      delivery_mode?: "pickup" | "delivery";
      items?: { sku?: string; qty?: number }[];
    };

    // Basic validation
    if (!customer_name || !phone) {
      return res
        .status(400)
        .json({ error: "Missing customer_name or phone" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    // Clean and normalize items
    const cleanedItems = items
      .map((it) => ({
        sku: (it.sku || "").trim(),
        qty: Number(it.qty || 0),
      }))
      .filter((it) => it.sku && it.qty > 0);

    if (!cleanedItems.length) {
      return res.status(400).json({
        error: "No valid items (sku & qty) provided",
      });
    }

    const trimmedPhone = phone.trim();
    const trimmedName = customer_name.trim();

    // Find or create a customer for this phone
    let customer = await db("customers")
      .where({ phone: trimmedPhone })
      .first();

    if (!customer) {
      const [inserted] = await db("customers")
        .insert(
          {
            name: trimmedName,
            phone: trimmedPhone,
            wa_id: null,
            lang: null,
          },
          "*"
        )
        .returning("*");
      customer = inserted;
    }

    // Use existing helper to create the order + order_items + payment
    const { orderId, orderCode, totalTzs } =
      await createManualOrderFromSkus({
        customerId: customer.id,
        phone: trimmedPhone,
        deliveryMode: (delivery_mode as "pickup" | "delivery") ?? "delivery",
        region: region ?? null,
        locationType:
          (location_type as "within" | "outside") ?? "within",
        items: cleanedItems.map((it) => ({
          sku: it.sku,
          qty: it.qty,
        })),
      });

    // Stock is already reduced in createOrderWithPayment.
    // Just notify UIs that product stock may have changed.
    emit("products.updated", {
      reason: "manual_order_created",
      order_id: orderId,
    });

    return res.status(201).json({
      ok: true,
      order_id: orderId,
      order_code: orderCode,
      total_tzs: totalTzs,
    });

  } catch (err: any) {
    console.error("[POST /api/orders/manual] failed", err);
    return res.status(500).json({
      error: err?.message ?? "Failed to create manual order",
    });
  }
});

// POST /api/orders/:id/status
// Body:
//   {
//     status: "pending" | "preparing" | "verifying" | "out_for_delivery" | "delivered" | "cancelled",
//     delivery_agent_phone?: string // required when status === "out_for_delivery"
//   }
inboxRoutes.post("/orders/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  const parsed = updateOrderStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid status payload" });
  }

  const { status: newStatus, delivery_agent_phone } = parsed.data;

  if (
    newStatus === "out_for_delivery" &&
    (!delivery_agent_phone || !delivery_agent_phone.trim())
  ) {
    return res
      .status(400)
      .json({ error: "Missing delivery_agent_phone for out_for_delivery" });
  }

  let affectedProductIds: number[] = [];

  try {
    const existingOrder = await db("orders")
      .where({ id })
      .first<{
        id: number;
        status: string | null;
      }>();

    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    const prevStatus = (existingOrder.status as string | null) ?? "pending";

    const isEnteringPreparing =
      prevStatus !== "preparing" && newStatus === "preparing";
    const isCancellingFromPreparing =
      prevStatus === "preparing" && newStatus === "cancelled";

    const updatedOrder = await db.transaction(async (trx) => {
      const update: Record<string, any> = {
        status: newStatus,
        updated_at: new Date(),
      };

      if (
        typeof delivery_agent_phone === "string" &&
        delivery_agent_phone.trim()
      ) {
        update.delivery_agent_phone = delivery_agent_phone.trim();
      }

      // 1) Update the order row
      await trx("orders").where({ id }).update(update);

      // 2) Adjust stock ONLY when moving into or out of "preparing"
      if (isEnteringPreparing || isCancellingFromPreparing) {
        const items = await trx("order_items")
          .where({ order_id: id })
          .select<{
            product_id: number | null;
            sku: string | null;
            qty: number;
          }[]>("product_id", "sku", "qty");

        const qtyByProduct = new Map<number, number>();
        const skusToResolve = new Set<string>();

        for (const item of items) {
          if (item.product_id) {
            const pid = item.product_id;
            const qty = Number(item.qty) || 0;
            if (qty <= 0) continue;
            const existing = qtyByProduct.get(pid) || 0;
            qtyByProduct.set(pid, existing + qty);
          } else if (item.sku && item.sku.trim()) {
            skusToResolve.add(item.sku.trim());
          }
        }

        if (skusToResolve.size > 0) {
          const skuList = Array.from(skusToResolve);
          const productsBySku = await trx("products")
            .whereIn("sku", skuList)
            .select<{ id: number; sku: string }[]>("id", "sku");

          const idBySku = new Map<string, number>();
          for (const p of productsBySku) {
            if (!p.sku) continue;
            idBySku.set(p.sku, p.id);
          }

          for (const item of items) {
            if (item.product_id) continue;
            if (!item.sku) continue;
            const sku = item.sku.trim();
            const pid = idBySku.get(sku);
            if (!pid) continue;

            const qty = Number(item.qty) || 0;
            if (qty <= 0) continue;

            const existing = qtyByProduct.get(pid) || 0;
            qtyByProduct.set(pid, existing + qty);
          }
        }

        const productIds = Array.from(qtyByProduct.keys());
        affectedProductIds = productIds;

        if (productIds.length > 0) {
          const productRows = await trx("products")
            .whereIn("id", productIds)
            .select<{ id: number; stock_qty: number | null }[]>(
              "id",
              "stock_qty"
            );

          for (const product of productRows) {
            const pid = product.id;
            const currentStock = Number(product.stock_qty ?? 0);
            const delta = qtyByProduct.get(pid) || 0;

            const newStock = isEnteringPreparing
              ? Math.max(0, currentStock - delta)
              : currentStock + delta;

            await trx("products")
              .where({ id: pid })
              .update({ stock_qty: newStock });
          }
        }
      }

      const updated = await trx("orders").where({ id }).first("*");
      return updated;
    });

    if (affectedProductIds.length > 0) {
      emit("products.updated", {
        reason: "order_status_changed",
        order_id: id,
        product_ids: affectedProductIds,
      });
    }

    emit("orders.updated", {
      reason: "status_changed",
      order_id: id,
      status: newStatus,
    });

    // 🔽 🔽 🔽 NEW PART: send WhatsApp + log message 🔽 🔽 🔽
    try {
      if (updatedOrder && updatedOrder.customer_id) {
        const customer = await db("customers")
          .where({ id: updatedOrder.customer_id })
          .first<{
            id: number;
            wa_id: string | null;
            lang: string | null;
          }>();

        const waId = customer?.wa_id ?? null;
        if (waId) {
          const lang: Lang =
            customer?.lang === "en" || customer?.lang === "sw"
              ? (customer.lang as Lang)
              : "sw";

          const orderCode =
            (updatedOrder as any).order_code || `UJ-${updatedOrder.id}`;

let msg: string | null = null;

if (newStatus === "preparing") {
  msg = t(lang, "order.preparing_message", { orderCode });
} else if (newStatus === "out_for_delivery") {
  const riderPhone =
    (delivery_agent_phone && delivery_agent_phone.trim()) ||
    ((updatedOrder as any).delivery_agent_phone?.trim?.() ?? "");

  msg = t(lang, "order.out_for_delivery_message", {
    orderCode,
    deliveryAgentPhone: riderPhone, // 👈 matches {deliveryAgentPhone} in i18n
  });
} else if (newStatus === "delivered") {
  msg = t(lang, "order.delivered_message", { orderCode });
}

          // you can add a cancelled message if you have it:
          // else if (newStatus === "cancelled") {
          //   msg = t(lang, "order.cancelled_message", { orderCode });
          // }

          if (msg) {
            // 1) send to WhatsApp
            await sendText(waId, msg);

            // 2) log to messages + emit to inbox UI
            const convo = await db("conversations")
              .where({ customer_id: updatedOrder.customer_id })
              .orderBy("created_at", "desc")
              .first<{ id: number }>();

            if (convo) {
              const inserted = await insertOutboundMessage(convo.id, "text", msg);

              emit("message.created", {
                conversation_id: convo.id,
                message: inserted,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(
        "[POST /api/orders/:id/status] failed to send/log status message",
        err
      );
    }
    // 🔼 🔼 🔼 END NEW PART 🔼 🔼 🔼

    return res.json({ ok: true, order: updatedOrder });
  } catch (err: any) {
    console.error("[POST /api/orders/:id/status] failed", err);
    return res.status(500).json({
      error: err?.message ?? "Failed to update order status",
    });
  }
});


// DELETE /api/orders/:id
// Soft-delete the order (sets deleted_at)
// DELETE /api/orders/:id  -> soft delete (set deleted_at)
inboxRoutes.delete("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  try {
    await db("orders").where({ id }).update({
      deleted_at: new Date(),
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/orders/:id failed", err);
    return res.status(500).json({ error: "internal_error" });
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

  const customerName =
  (req.body.customer_name as string | undefined)?.trim() || undefined;

  const order = await db("orders").where({ id }).first();

if (customerName && order?.customer_id) {
  await db("customers")
    .where({ id: order.customer_id })
    .update({ name: customerName });
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
        "stock_qty",
        "short_description",
        "short_description_en",
        "description",
        "description_en",
        "is_installment",
        "is_active",
        "stock_qty",   // <-- include stock
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
// helper to auto-generate a SKU from the name
function generateSkuFromName(rawName: string | undefined): string {
  const base = (rawName || "product")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();

  return `${base || "product"}-${rand}${ts}`.toUpperCase();
}

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
      usage_instructions,
      warnings,
      is_installment,
      is_active,
      stock_qty,
    } = req.body ?? {};

    if (!name || price_tzs == null) {
      return res
        .status(400)
        .json({ error: "Missing name or price_tzs" });
    }

    const price = Number(price_tzs);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: "Invalid price" });
    }

    const stockNum =
      stock_qty === undefined || stock_qty === null
        ? 0
        : Number(stock_qty);

    // if sku is not provided, auto-generate one
    let finalSku = (sku ?? "").toString().trim();
    if (!finalSku) {
      finalSku = generateSkuFromName(name);
    }

    const [created] = await db("products")
      .insert(
        {
          sku: finalSku,
          name: String(name).trim(),
          price_tzs: price,

          // Swahili short description (required in DB, default to empty string)
          short_description: short_description
            ? String(short_description).trim()
            : "",

          // Optional English short description
          short_description_en: short_description_en
            ? String(short_description_en).trim()
            : null,

          // Full Swahili description (required, default to empty string)
          description: description ? String(description).trim() : "",

          // Optional English description
          description_en: description_en
            ? String(description_en).trim()
            : null,

          // ✅ NEW: fill NOT NULL columns so DB doesn’t error
          usage_instructions: usage_instructions
            ? String(usage_instructions).trim()
            : "",
          warnings: warnings ? String(warnings).trim() : "",

          is_installment: !!is_installment,
          is_active: is_active !== undefined ? !!is_active : true,

          stock_qty: Number.isFinite(stockNum)
            ? Math.max(0, Math.floor(stockNum))
            : 0,
        },
        "*"
      );

    emit("product.created", { product: created });

    return res.status(201).json({ product: created });
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
      stock_qty,
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

    if (stock_qty !== undefined) {
      const stockNum = Number(stock_qty);
      if (!Number.isFinite(stockNum) || stockNum < 0) {
        return res
          .status(400)
          .json({ error: "Invalid stock_qty (must be >= 0)" });
      }
      patch.stock_qty = Math.floor(stockNum);
    }

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

    emit("product.updated", { product: updated });

    return res.json({ product: updated });
  } catch (err: any) {
    console.error("PUT /products/:id failed", err);
    if (err?.code === "23505") {
      return res.status(400).json({ error: "SKU already exists" });
    }
    return res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE /api/products/:id  -> hard delete (no soft inactive)
inboxRoutes.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  try {
    const deletedCount = await db("products").where({ id }).del();

    if (deletedCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    emit("product.deleted", { product_id: id });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /products/:id failed", err);
    return res
      .status(500)
      .json({ error: "Failed to delete product" });
  }
});

// GET /api/stats/overview
// ------------------------------- STATS --------------------------------------

// GET /api/stats/overview
// High–level numbers used on the Stats page.
// Supports optional ?days=N to restrict to the last N days (inclusive).
inboxRoutes.get("/stats/overview", async (req: Request, res: Response) => {
  try {
    const raw = req.query.days;
    let days = Number(typeof raw === "string" ? raw : raw ?? 7);
    if (!Number.isFinite(days) || days <= 0) days = 7;
    if (days > 365) days = 365;

    // Compute "since" date: beginning of the day N-1 days ago
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const sinceTimestamp = since.toISOString();          // for TIMESTAMP columns
    const sinceDate = since.toISOString().slice(0, 10);  // for DATE columns (YYYY-MM-DD)

    // Sum of APPROVED incomes within the period
    const incomeAgg = (await db("incomes")
      .where("status", "approved")
      .andWhere("created_at", ">=", sinceTimestamp)
      .sum<{ total_revenue: string | number }>(
        "amount_tzs as total_revenue"
      )
      .first()) as { total_revenue?: string | number } | undefined;

    // Sum of ALL expenses within the period
    const expenseAgg = (await db("expenses")
      .where("incurred_on", ">=", sinceDate)
      .sum<{ total_expenses: string | number }>(
        "amount_tzs as total_expenses"
      )
      .first()) as { total_expenses?: string | number } | undefined;

    // Completed orders = delivered (within the period)
    const orderAgg = (await db("orders")
      .where("status", "delivered")
      .andWhere("created_at", ">=", sinceTimestamp)
      .count<{ order_count: string | number }>("* as order_count")
      .first()) as { order_count?: string | number } | undefined;

    // Delivery fees from delivered orders (within the period)
    const deliveryAgg = (await db("orders")
      .where("status", "delivered")
      .andWhere("created_at", ">=", sinceTimestamp)
      .sum<{ total_delivery_fees: string | number }>(
        "fee_tzs as total_delivery_fees"
      )
      .first()) as {
      total_delivery_fees?: string | number;
    } | undefined;

    const total_revenue =
      Number(incomeAgg?.total_revenue ?? 0) || 0;
    const total_expenses =
      Number(expenseAgg?.total_expenses ?? 0) || 0;
    const order_count =
      Number(orderAgg?.order_count ?? 0) || 0;
    const total_delivery_fees =
      Number(deliveryAgg?.total_delivery_fees ?? 0) || 0;

    const approximate_profit = total_revenue - total_expenses;

    res.json({
      order_count,
      total_revenue,
      total_delivery_fees,
      total_expenses,
      approximate_profit,
    });
  } catch (err) {
    console.error("GET /api/stats/overview failed", err);
    res.status(500).json({ error: "Failed to load overview stats" });
  }
});


// GET /api/stats/daily-incomes
// Used for the "Profit Trend" chart – sums APPROVED incomes per day
inboxRoutes.get(
  "/stats/daily-incomes",
  async (req: Request, res: Response) => {
    try {
      const raw = req.query.days;
      let days = Number(
        typeof raw === "string" ? raw : raw ?? 7
      );
      if (!Number.isFinite(days) || days <= 0) days = 7;
      if (days > 60) days = 60;

      const since = new Date();
      since.setDate(since.getDate() - (days - 1));
      const sinceDate = since.toISOString().slice(0, 10);

      const rows = await db("incomes")
        .where("status", "approved")
        .andWhere("recorded_at", ">=", sinceDate)
        .select(
          db.raw("DATE(recorded_at) as day"),
          db.raw("SUM(amount_tzs) as total_tzs")
        )
        .groupBy("day")
        .orderBy("day", "asc");

      const points = (rows as any[]).map((r) => ({
        date: r.day as string,
        total_tzs: Number(r.total_tzs ?? 0) || 0,
      }));

      res.json({ points });
    } catch (err) {
      console.error("GET /api/stats/daily-incomes failed", err);
      res
        .status(500)
        .json({ error: "Failed to load daily incomes" });
    }
  }
);


// GET /api/stats/products
inboxRoutes.get("/stats/products", async (_req: Request, res: Response) => {
  try {
    const rows = await db("order_items as oi")
      .join("orders as o", "oi.order_id", "o.id")
      .join("products as p", "oi.sku", "p.sku")
      .whereIn("o.status", ["paid", "delivered"])
      .groupBy("oi.sku", "p.name")
      .select(
        "oi.sku as sku",
        "p.name",
        db.raw("SUM(oi.qty)::int as total_qty"),
        db.raw(
          "COALESCE(SUM(oi.qty * oi.unit_price_tzs), 0)::int as total_revenue"
        )
      )
      .orderBy("total_revenue", "desc");

    res.json({ items: rows });
  } catch (err) {
    console.error("GET /api/stats/products failed", err);
    res.status(500).json({ error: "failed_to_load_stats" });
  }
});

// ---------------------------------------------------------------------------
// Expenses CRUD for admin (to track rent, riders, salaries, etc.)
// ---------------------------------------------------------------------------

// GET /api/expenses  -> list recent expenses
inboxRoutes.get("/expenses", async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.limit;
    const limit = Math.min(
      200,
      Math.max(
        1,
        Number(
          typeof limitRaw === "string" ? limitRaw : (limitRaw ?? 50)
        )
      )
    );

    const rows = await db("expenses")
      .orderBy("incurred_on", "desc")
      .orderBy("id", "desc")
      .limit(limit);

    res.json({ items: rows });
  } catch (err) {
    console.error("GET /api/expenses failed", err);
    res.status(500).json({ error: "Failed to load expenses" });
  }
});

// POST /api/expenses  -> create new expense
inboxRoutes.post("/expenses", async (req: Request, res: Response) => {
  try {
    const {
      incurred_on,
      category,
      amount_tzs,
      description,
    } = req.body ?? {};

    const amount = Number(amount_tzs);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Invalid amount_tzs (must be > 0)" });
    }

    let incurredDate: Date | null = null;
    if (incurred_on) {
      const d = new Date(String(incurred_on));
      if (!Number.isNaN(d.getTime())) {
        incurredDate = d;
      }
    }

    const [inserted] = await db("expenses")
      .insert({
        incurred_on: incurredDate ?? new Date(),
        category: (category ?? "other").toString().slice(0, 50),
        amount_tzs: Math.round(amount),
        description:
          description != null ? String(description).trim() : null,
      })
      .returning("*");

    res.json({ expense: inserted });
  } catch (err) {
    console.error("POST /api/expenses failed", err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

// PUT /api/expenses/:id  -> update an expense
inboxRoutes.put("/expenses/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid expense id" });
  }

  try {
    const {
      incurred_on,
      category,
      amount_tzs,
      description,
    } = req.body ?? {};

    const patch: any = {};

    if (incurred_on !== undefined) {
      const d = new Date(String(incurred_on));
      if (!Number.isNaN(d.getTime())) {
        patch.incurred_on = d;
      }
    }

    if (category !== undefined) {
      patch.category = String(category).slice(0, 50);
    }

    if (amount_tzs !== undefined) {
      const amount = Number(amount_tzs);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res
          .status(400)
          .json({ error: "Invalid amount_tzs (must be > 0)" });
      }
      patch.amount_tzs = Math.round(amount);
    }

    if (description !== undefined) {
      patch.description =
        description != null ? String(description).trim() : null;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    patch.updated_at = new Date();

    const [updated] = await db("expenses")
      .where({ id })
      .update(patch)
      .returning("*");

    if (!updated) {
      return res.status(404).json({ error: "Expense not found" });
    }

    res.json({ expense: updated });
  } catch (err) {
    console.error("PUT /api/expenses/:id failed", err);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// DELETE /api/expenses/:id  -> delete an expense
inboxRoutes.delete("/expenses/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid expense id" });
  }

  try {
    const deleted = await db("expenses").where({ id }).del();
    if (!deleted) {
      return res.status(404).json({ error: "Expense not found" });
    }
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/expenses/:id failed", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

const VALID_INCOME_STATUSES = ["pending", "approved", "rejected"] as const;

// GET /api/incomes  -> list recent incomes
inboxRoutes.get("/incomes", async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.limit;
    const limit = Math.min(
      200,
      Math.max(
        1,
        Number(
          typeof limitRaw === "string" ? limitRaw : (limitRaw ?? 50)
        )
      )
    );

    const statusParam =
      typeof req.query.status === "string"
        ? req.query.status.toLowerCase()
        : null;

    if (
      statusParam &&
      !VALID_INCOME_STATUSES.includes(statusParam as any)
    ) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    let query = db("incomes as i")
      .leftJoin("orders as o", "i.order_id", "o.id")
      .leftJoin("customers as c", "o.customer_id", "c.id")
      .orderBy("i.recorded_at", "desc")
      .limit(limit)
      .select(
        "i.*",
        "o.order_code",
        "c.name as customer_name",
        "c.phone as customer_phone"
      );

    if (statusParam) {
      query = query.where("i.status", statusParam);
    }

    const rows = await query;

    res.json({ items: rows });
  } catch (err) {
    console.error("GET /api/incomes failed", err);
    res.status(500).json({ error: "Failed to load incomes" });
  }
});

// POST /api/incomes  -> create new income (usually manual)
inboxRoutes.post("/incomes", async (req: Request, res: Response) => {
  try {
    const {
      order_id,
      amount_tzs,
      status,
      source,
      description,
    } = req.body ?? {};

    const amount = Number(amount_tzs);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Invalid amount_tzs (must be > 0)" });
    }

    let newStatus = (status ?? "pending").toString().toLowerCase();
    if (!VALID_INCOME_STATUSES.includes(newStatus as any)) {
      newStatus = "pending";
    }

    const hasOrderId =
      order_id !== undefined && order_id !== null && order_id !== "";
    const sourceValue = hasOrderId
      ? (source ?? "order")
      : (source ?? "manual");

    const [inserted] = await db("incomes")
      .insert({
        order_id: hasOrderId ? Number(order_id) : null,
        amount_tzs: Math.round(amount),
        status: newStatus,
        source: String(sourceValue).slice(0, 50),
        description:
          description != null ? String(description).trim() : null,
        recorded_at: new Date(),
      })
      .returning("*");

    res.json({ income: inserted });
  } catch (err) {
    console.error("POST /api/incomes failed", err);
    res.status(500).json({ error: "Failed to create income" });
  }
});

// PATCH /api/incomes/:id  -> update income (amount, status, description)
inboxRoutes.patch("/incomes/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid income id" });
  }

  try {
    const existing = await db("incomes").where({ id }).first();
    if (!existing) {
      return res.status(404).json({ error: "Income not found" });
    }

    const { amount_tzs, status, description } = req.body ?? {};
    const patch: any = {};

    if (amount_tzs !== undefined) {
      const amount = Number(amount_tzs);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res
          .status(400)
          .json({ error: "Invalid amount_tzs (must be > 0)" });
      }
      patch.amount_tzs = Math.round(amount);
    }

    if (status !== undefined) {
      let newStatus = String(status).toLowerCase();
      if (!VALID_INCOME_STATUSES.includes(newStatus as any)) {
        return res.status(400).json({ error: "Invalid status value" });
      }
      patch.status = newStatus;

      const now = new Date();
      if (newStatus === "approved") {
        patch.approved_at = now;
        patch.rejected_at = null;
      } else if (newStatus === "rejected") {
        patch.rejected_at = now;
        patch.approved_at = null;
      } else {
        patch.approved_at = null;
        patch.rejected_at = null;
      }
    }

    if (description !== undefined) {
      patch.description =
        description != null ? String(description).trim() : null;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    patch.updated_at = new Date();

    const [updated] = await db("incomes")
      .where({ id })
      .update(patch)
      .returning("*");

    res.json({ income: updated });
  } catch (err) {
    console.error("PATCH /api/incomes/:id failed", err);
    res.status(500).json({ error: "Failed to update income" });
  }
});

// DELETE /api/incomes/:id  -> delete income
inboxRoutes.delete("/incomes/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid income id" });
  }

  try {
    const deleted = await db("incomes").where({ id }).del();
    if (!deleted) {
      return res.status(404).json({ error: "Income not found" });
    }
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/incomes/:id failed", err);
    res.status(500).json({ error: "Failed to delete income" });
  }
});

