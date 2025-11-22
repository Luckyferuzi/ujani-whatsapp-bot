// backend/src/db/queries.ts
import db from "./knex.js";
import knex from "./knex.js";

/* ---------------------------- Customers / convos --------------------------- */
// Find order by internal numeric ID
export async function findOrderById(orderId: number) {
  const order = await db("orders").where({ id: orderId }).first();
  if (!order) return null;

  const payment = await db("payments")
    .where({ order_id: order.id })
    .orderBy("created_at", "desc")
    .first();

  return { order, payment };
}

// Find latest order by customer name (approx match)
export async function findLatestOrderByCustomerName(name: string) {
  const rows = await db("orders")
    .join("customers", "orders.customer_id", "customers.id")
    .whereILike("customers.name", `%${name}%`)
    .orderBy("orders.created_at", "desc")
    .select("orders.*");

  if (!rows || rows.length === 0) return null;

  const order = rows[0];
  const payment = await db("payments")
    .where({ order_id: order.id })
    .orderBy("created_at", "desc")
    .first();

  return { order, payment };
}


export async function upsertCustomerByWa(
  waId: string,
  name?: string | null,
  phone?: string | null
) {
  const existing = await db("customers").where({ wa_id: waId }).first();

  if (existing) {
    const update: any = {};

    if (name && name.trim().length > 0 && name !== existing.name) {
      update.name = name.trim();
    }

    if (phone && phone.trim().length > 0 && phone !== existing.phone) {
      update.phone = phone.trim();
    }

    if (Object.keys(update).length > 0) {
      await db("customers").where({ id: existing.id }).update(update);
    }

    return existing.id as number;
  }

  const [inserted] = await db("customers")
    .insert({
      wa_id: waId,
      name: name?.trim() ?? null,
      phone: phone?.trim() ?? null,
    })
    .returning<{ id: number }[]>("id");

  return inserted.id;
}


export async function getOrCreateConversation(customerId: number) {
  const existing = await db("conversations")
    .where({ customer_id: customerId })
    .orderBy("id", "desc")
    .first();

  if (existing) return existing.id as number;

  const [inserted] = await db("conversations")
    .insert({
      customer_id: customerId,
      agent_allowed: false,
    })
    .returning<{ id: number }[]>("id");

  return inserted.id;
}

/* ------------------------------ Message logging ---------------------------- */

export async function insertInboundMessage(
  conversationId: number,
  waMessageId: string | null,
  type: string,
  body: string | null
) {
  const [inserted] = await db("messages")
    .insert({
      conversation_id: conversationId,
      wa_message_id: waMessageId ?? null,
      direction: "inbound",
      type,
      body,
      status: "delivered"
    })
    .returning([
      "id",
      "conversation_id",
      "direction",
      "type",
      "body",
      "status",
      "created_at",
    ]);

  return inserted;
}

export async function insertOutboundMessage(
  conversationId: number,
  type: string,
  body: string
) {
  const [inserted] = await db("messages")
    .insert({
      conversation_id: conversationId,
      direction: "out",
      type,
      body,
    })
    .returning([
      "id",
      "conversation_id",
      "direction",
      "type",
      "body",
      "status",
      "created_at",
    ]);

  return inserted;
}

export async function updateConversationLastUserMessageAt(
  conversationId: number
) {
  await db("conversations")
    .where({ id: conversationId })
    .update({ last_user_message_at: db.fn.now() });
}

export async function findConversationRecipientWa(
  conversationId: number
): Promise<string | undefined> {
  const row = await db("conversations as c")
    .leftJoin("customers as cu", "cu.id", "c.customer_id")
    .where("c.id", conversationId)
    .select<{ wa_id: string }>("cu.wa_id")
    .first();

  return row?.wa_id;
}

/* ----------------------------- Inbox list / view --------------------------- */

export async function listConversations(limit = 200) {
  return db("conversations as c")
    .leftJoin("customers as cu", "cu.id", "c.customer_id")
    .select(
      "c.id",
      "c.last_user_message_at",
      "c.created_at",
      "cu.name",
      "cu.phone"
    )
    // Order by "last_user_message_at" when present, otherwise by created_at
    .orderByRaw("COALESCE(c.last_user_message_at, c.created_at) DESC")
    .limit(limit);
}


export async function listMessages(conversationId: number, limit = 500) {
  return db("messages")
    .where({ conversation_id: conversationId })
    .select(
      "id",
      "conversation_id",
      "direction",
      "type",
      "body",
      "status",
      "created_at"
    )
    .orderBy("created_at", "asc")
    .limit(limit);
}

/* -------------------------- Orders + payments (NEW) ------------------------ */

export type OrderItemInput = {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
};

export interface CreateOrderInput {
  customerId: number;
  status?: string; // pending | verifying | paid | failed
  deliveryMode: "pickup" | "delivery";
  km?: number | null;
  feeTzs: number;
  totalTzs: number;
  phone?: string | null;
  region?: string | null;
  lat?: number | null;
  lon?: number | null;
  items: OrderItemInput[];
}

/**
 * Creates:
 * - one row in `orders`
 * - many rows in `order_items`
 * - one row in `payments` with status "verifying"
 *
 * Everything is wrapped in a transaction so it either fully succeeds or fails.
 */

async function generateOrderCode(trx: any): Promise<string> {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  for (let i = 0; i < 5; i++) {
    const randomPart = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    const code = `UJ-${datePart}-${randomPart}`;

    const existing = await trx("orders").where({ order_code: code }).first();
    if (!existing) return code;
  }

  // Very unlikely fallback
  return `UJ-${datePart}-${Date.now().toString().slice(-6)}`;
}


export async function createOrderWithPayment(input: CreateOrderInput) {
  return db.transaction(async (trx) => {
    const orderCode = await generateOrderCode(trx);

    const [order] = await trx("orders")
      .insert({
        customer_id: input.customerId,
        status: input.status ?? "pending",
        delivery_mode: input.deliveryMode,
        km: input.km ?? null,
        fee_tzs: input.feeTzs,
        total_tzs: input.totalTzs,
        phone: input.phone ?? null,
        region: input.region ?? null,
        lat: input.lat ?? null,
        lon: input.lon ?? null,
        order_code: orderCode,
      })
      .returning<{ id: number; order_code: string }[]>("id");

    const orderId = order.id;

    if (input.items && input.items.length) {
      const rows = input.items.map((it) => ({
        order_id: orderId,
        sku: it.sku,
        name: it.name,
        qty: it.qty,
        unit_price_tzs: it.unitPrice,
      }));
      await trx("order_items").insert(rows);
    }

    // Single, aggregated payment row per order.
    // Each time you confirm a payment, we increment `amount_tzs` on this row.
    const [payment] = await trx("payments")
      .insert({
        order_id: orderId,
        method: null,
        reference: null,
        proof_url: null,
        status: "awaiting",
        amount_tzs: 0,
      })
      .returning<{ id: number }[]>("id");

    return {
      orderId,
      orderCode,
      paymentId: payment.id,
    };
  });
}

export interface OrderSummary {
  id: number;
  customer_id: number;
  order_code: string | null;
  status: string;
  total_amount: number;
  created_at: string;
}

export async function getOrdersForCustomer(
  customerId: number,
  limit = 20
): Promise<OrderSummary[]> {
  const rows = await knex("orders")
    .where({ customer_id: customerId })
    .orderBy("created_at", "desc")
    .limit(limit);

  return rows.map((row: any) => ({
    id: row.id,
    customer_id: row.customer_id,
    order_code: row.order_code ?? null,
    status: row.status,
    total_amount: Number(row.total_tzs ?? 0),
    created_at: row.created_at,
  }));
}


