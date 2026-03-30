// backend/src/db/queries.ts
import crypto from "crypto";
import db from "./knex.js";
import knex from "./knex.js";
import {
  buildConversationLifecycleTimeline,
  describeBusinessEvent,
  type TimelineItem,
} from "../customerContext.js";
import {
  assertOrderStatusTransition,
  canTransitionOrderStatus,
  type DbOrderStatus,
} from "../orders.js";
import {
  accumulatePaymentAmount,
  assertPaymentStatusTransition,
  canTransitionPaymentStatus,
  computeRemainingPayment,
  type PaymentStatus,
} from "../payments.js";

export type ReconcileStats = {
  groups_merged: number;
  customers_merged: number;
  conversations_merged: number;
  messages_moved: number;
};

function digitsOnly(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function pickBetterName(current?: string | null, incoming?: string | null): string | null {
  const a = String(current ?? "").trim();
  const b = String(incoming ?? "").trim();
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  // Keep the longer non-numeric style name when possible.
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && !bNumeric) return b;
  if (!aNumeric && bNumeric) return a;
  return b.length >= a.length ? b : a;
}

function paymentSatisfiedStatuses() {
  return ["paid", "completed"];
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export type OrderEventType =
  | "conversation.started"
  | "conversation.resumed"
  | "order.created"
  | "order.status_changed"
  | "order.payment_mode_updated"
  | "payment.proof_submitted"
  | "payment.status_changed";

export type InternalNoteScope = "conversation" | "order" | "customer";

export type InternalNoteRow = {
  id: number;
  scope: InternalNoteScope;
  conversation_id: number | null;
  order_id: number | null;
  customer_id: number | null;
  body: string;
  created_by_user_id: number | null;
  created_by_email: string | null;
  created_at: string;
};

export type AppendOrderEventInput = {
  orderId?: number | null;
  paymentId?: number | null;
  customerId?: number | null;
  conversationId?: number | null;
  messageId?: number | null;
  eventType: OrderEventType;
  actorType?: "system" | "customer" | "admin";
  actorUserId?: number | null;
  actorEmail?: string | null;
  source?: string | null;
  dedupeKey?: string | null;
  payload?: any;
};

async function appendOrderEventUsing(trx: any, input: AppendOrderEventInput) {
  const payloadJson = input.payload ?? {};

  try {
    const [inserted] = await trx("order_events")
      .insert({
        order_id: input.orderId ?? null,
        payment_id: input.paymentId ?? null,
        customer_id: input.customerId ?? null,
        conversation_id: input.conversationId ?? null,
        message_id: input.messageId ?? null,
        event_type: input.eventType,
        actor_type: input.actorType ?? "system",
        actor_user_id: input.actorUserId ?? null,
        actor_email: input.actorEmail ?? null,
        source: input.source ?? null,
        dedupe_key: input.dedupeKey ?? null,
        payload_json: payloadJson,
      })
      .returning("*");

    return { event: inserted, duplicate: false as const };
  } catch (error: any) {
    if (
      input.dedupeKey &&
      (error?.code === "23505" || String(error?.message ?? "").includes("dedupe_key"))
    ) {
      const existing = await trx("order_events")
        .where({ dedupe_key: input.dedupeKey })
        .first();
      return { event: existing ?? null, duplicate: true as const };
    }
    throw error;
  }
}

export async function appendOrderEvent(input: AppendOrderEventInput) {
  return appendOrderEventUsing(db, input);
}

export async function listOrderEventsForOrder(orderId: number, limit = 100) {
  return db("order_events")
    .where({ order_id: orderId })
    .orderBy("created_at", "desc")
    .limit(limit);
}

export function normalizeInternalNoteBody(body: string): string {
  return String(body ?? "").replace(/\s+/g, " ").trim();
}

function mapEventRowToTimelineItem(row: any): TimelineItem {
  const described = describeBusinessEvent({
    eventType: String(row.event_type ?? ""),
    payload: row.payload_json ?? {},
  });

  return {
    id: `event:${row.id}`,
    kind: "event",
    event_type: String(row.event_type ?? ""),
    title: described.title,
    description: described.description,
    created_at: new Date(row.created_at).toISOString(),
    actor_label: row.actor_email ?? row.actor_type ?? null,
    actor_type: row.actor_type ?? null,
    conversation_id: row.conversation_id ?? null,
    order_id: row.order_id ?? null,
    payment_id: row.payment_id ?? null,
    customer_id: row.customer_id ?? null,
  };
}

function mapNoteRowToTimelineItem(row: InternalNoteRow): TimelineItem {
  const described = describeBusinessEvent({
    eventType: "internal.note_added",
    scope: row.scope,
  });

  return {
    id: `note:${row.id}`,
    kind: "note",
    event_type: "internal.note_added",
    title: described.title,
    description: row.body,
    created_at: new Date(row.created_at).toISOString(),
    actor_label: row.created_by_email ?? "Internal",
    actor_type: "admin",
    conversation_id: row.conversation_id ?? null,
    order_id: row.order_id ?? null,
    customer_id: row.customer_id ?? null,
    scope: row.scope,
  };
}

export async function createInternalNote(args: {
  scope: InternalNoteScope;
  body: string;
  conversationId?: number | null;
  orderId?: number | null;
  customerId?: number | null;
  actorUserId?: number | null;
  actorEmail?: string | null;
}) {
  const normalizedBody = normalizeInternalNoteBody(args.body);
  if (!normalizedBody) {
    throw new Error("note_body_required");
  }

  const [inserted] = await db("internal_notes")
    .insert({
      scope: args.scope,
      conversation_id: args.conversationId ?? null,
      order_id: args.orderId ?? null,
      customer_id: args.customerId ?? null,
      body: normalizedBody,
      created_by_user_id: args.actorUserId ?? null,
      created_by_email: args.actorEmail ?? null,
    })
    .returning("*");

  return inserted as InternalNoteRow;
}

export async function listInternalNotesForOrder(orderId: number, limit = 50) {
  return (await db("internal_notes")
    .where({ order_id: orderId })
    .orWhere((qb) => {
      qb.whereIn(
        "customer_id",
        db("orders").where({ id: orderId }).select("customer_id")
      );
    })
    .orderBy("created_at", "desc")
    .limit(limit)) as InternalNoteRow[];
}

export async function listTimelineForOrder(orderId: number, limit = 60): Promise<TimelineItem[]> {
  const order = await db("orders")
    .where({ id: orderId })
    .select("id", "customer_id")
    .first();

  if (!order) return [];

  const [eventRows, noteRows] = await Promise.all([
    db("order_events")
      .where({ order_id: orderId })
      .orderBy("created_at", "desc")
      .limit(limit),
    db("internal_notes")
      .where({ order_id: orderId })
      .orWhere((qb) => {
        qb.where({ customer_id: order.customer_id }).whereNull("order_id");
      })
      .orderBy("created_at", "desc")
      .limit(limit),
  ]);

  return [...(eventRows as any[]).map(mapEventRowToTimelineItem), ...(noteRows as InternalNoteRow[]).map(mapNoteRowToTimelineItem)]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export async function listTimelineForConversation(
  conversationId: number,
  limit = 60
): Promise<TimelineItem[]> {
  const conversation = await db("conversations")
    .where({ id: conversationId })
    .select("id", "customer_id", "created_at")
    .first();

  if (!conversation) return [];

  const [messages, orderRows, eventRows, noteRows] = await Promise.all([
    db("messages")
      .where({ conversation_id: conversationId })
      .select("id", "direction", "type", "body", "created_at")
      .orderBy("created_at", "asc")
      .limit(500),
    db("orders").where({ customer_id: conversation.customer_id }).select("id"),
    db("order_events")
      .where((qb) => {
        qb.where({ conversation_id: conversationId }).orWhere({ customer_id: conversation.customer_id });
      })
      .orderBy("created_at", "desc")
      .limit(limit),
    db("internal_notes")
      .where((qb) => {
        qb.where({ conversation_id: conversationId }).orWhere({ customer_id: conversation.customer_id });
      })
      .orderBy("created_at", "desc")
      .limit(limit),
  ]);

  const orderIds = (orderRows as any[]).map((row) => Number(row.id)).filter((value) => Number.isFinite(value));
  let orderScopedEvents: any[] = [];
  let orderScopedNotes: InternalNoteRow[] = [];

  if (orderIds.length > 0) {
    orderScopedEvents = await db("order_events")
      .whereIn("order_id", orderIds)
      .orderBy("created_at", "desc")
      .limit(limit);

    orderScopedNotes = (await db("internal_notes")
      .whereIn("order_id", orderIds)
      .orderBy("created_at", "desc")
      .limit(limit)) as InternalNoteRow[];
  }

  const lifecycle = buildConversationLifecycleTimeline({
    conversationId,
    customerId: conversation.customer_id,
    createdAt: conversation.created_at,
    messages: messages as any[],
  });

  const deduped = new Map<string, TimelineItem>();
  for (const item of lifecycle) {
    deduped.set(item.id, item);
  }
  for (const row of [...(eventRows as any[]), ...orderScopedEvents]) {
    deduped.set(`event:${row.id}`, mapEventRowToTimelineItem(row));
  }
  for (const row of [...(noteRows as InternalNoteRow[]), ...orderScopedNotes]) {
    deduped.set(`note:${row.id}`, mapNoteRowToTimelineItem(row));
  }

  return [...deduped.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

async function mergeCustomerRecordsTx(
  trx: any,
  canonicalId: number,
  duplicateIds: number[]
): Promise<{ customersMerged: number }> {
  if (!duplicateIds.length) return { customersMerged: 0 };

  // Move child relations.
  await trx("conversations")
    .whereIn("customer_id", duplicateIds)
    .update({ customer_id: canonicalId });

  await trx("orders")
    .whereIn("customer_id", duplicateIds)
    .update({ customer_id: canonicalId });

  await trx("opt_ins")
    .whereIn("customer_id", duplicateIds)
    .update({ customer_id: canonicalId });

  // Avoid unique collision on (customer_id, product_id).
  for (const dupId of duplicateIds) {
    const dupRows = await trx("restock_subscriptions")
      .where({ customer_id: dupId })
      .select("product_id");

    const productIds = (dupRows as any[])
      .map((r: any) => Number(r.product_id))
      .filter((v: number) => Number.isFinite(v));
    if (productIds.length > 0) {
      await trx("restock_subscriptions")
        .where({ customer_id: canonicalId })
        .whereIn("product_id", productIds)
        .del();
    }
  }

  await trx("restock_subscriptions")
    .whereIn("customer_id", duplicateIds)
    .update({ customer_id: canonicalId });

  await trx("customers").whereIn("id", duplicateIds).del();
  return { customersMerged: duplicateIds.length };
}

async function consolidateConversationsForCustomerTx(
  trx: any,
  customerId: number,
  preferredPhoneNumberId?: string | null
): Promise<{ canonicalId: number | null; conversationsMerged: number; messagesMoved: number }> {
  const rows = await trx("conversations")
    .where({ customer_id: customerId })
    .orderByRaw("COALESCE(last_user_message_at, created_at) DESC")
    .orderBy("id", "desc")
    .select("id", "phone_number_id", "agent_allowed", "last_user_message_at");

  if (!rows.length) {
    return { canonicalId: null, conversationsMerged: 0, messagesMoved: 0 };
  }

  const typedRows = rows as any[];
  const canonical = typedRows[0];
  const duplicateIds = typedRows.slice(1).map((r: any) => r.id);

  if (duplicateIds.length > 0) {
    const moved = await trx("messages")
      .whereIn("conversation_id", duplicateIds)
      .update({ conversation_id: canonical.id });

    let latestLastUserAt = canonical.last_user_message_at;
    let agentAllowed = !!canonical.agent_allowed;
    let phoneNumberId = canonical.phone_number_id ?? null;

    for (const row of typedRows.slice(1)) {
      if (row.last_user_message_at && (!latestLastUserAt || row.last_user_message_at > latestLastUserAt)) {
        latestLastUserAt = row.last_user_message_at;
      }
      if (row.agent_allowed) agentAllowed = true;
      if (!phoneNumberId && row.phone_number_id) phoneNumberId = row.phone_number_id;
    }

    await trx("conversations")
      .where({ id: canonical.id })
      .update({
        last_user_message_at: latestLastUserAt ?? null,
        agent_allowed: agentAllowed,
        phone_number_id: preferredPhoneNumberId ?? phoneNumberId ?? null,
      });

    await trx("conversations").whereIn("id", duplicateIds).del();
    return {
      canonicalId: canonical.id,
      conversationsMerged: duplicateIds.length,
      messagesMoved: Number(moved ?? 0),
    };
  } else if (preferredPhoneNumberId && canonical.phone_number_id !== preferredPhoneNumberId) {
    await trx("conversations")
      .where({ id: canonical.id })
      .update({ phone_number_id: preferredPhoneNumberId });
  }

  return { canonicalId: canonical.id, conversationsMerged: 0, messagesMoved: 0 };
}

/* ------------------------------ Products ---------------------------------- */

export interface ProductRow {
  id: number;
  sku: string;
  name: string;
  price_tzs: number;
  short_description: string;
  description: string;
  usage_instructions: string;
  warnings: string;
  is_installment: boolean;
  is_active: boolean;
  stock_qty?: number; // <-- from products.stock_qty (may be undefined on old rows)

  // Optional discount fields from product_discounts (if present)
  discount_type?: "percentage" | "fixed" | null;
  discount_amount?: number | null;   // 10 (10%) or 5000 (TZS off)
  discount_name?: string | null;
  discount_is_active?: boolean | null;
}

export async function listActiveProducts(): Promise<ProductRow[]> {
  const rows = await db("products as p")
    .leftJoin("product_discounts as d", "d.product_id", "p.id")
    .where("p.is_active", true)
    .select([
      "p.id",
      "p.sku",
      "p.name",
      "p.price_tzs",
      "p.short_description",
      "p.description",
      "p.usage_instructions",
      "p.warnings",
      "p.is_installment",
      "p.is_active",
      "p.stock_qty",
      "d.type as discount_type",
      "d.amount as discount_amount",
      "d.name as discount_name",
      "d.is_active as discount_is_active",
    ])
    .orderBy("p.name", "asc");

  return rows as ProductRow[];
}

export async function findProductBySku(
  sku: string
): Promise<ProductRow | null> {
  if (!sku) return null;

  const row = await db("products as p")
    .leftJoin("product_discounts as d", "d.product_id", "p.id")
    .whereRaw("LOWER(p.sku) = LOWER(?)", [sku])
    .select([
      "p.id",
      "p.sku",
      "p.name",
      "p.price_tzs",
      "p.short_description",
      "p.description",
      "p.usage_instructions",
      "p.warnings",
      "p.is_installment",
      "p.is_active",
      "p.stock_qty",
      "d.type as discount_type",
      "d.amount as discount_amount",
      "d.name as discount_name",
      "d.is_active as discount_is_active",
    ])
    .first();

  return (row as ProductRow) ?? null;
}

export async function findProductById(
  id: number
): Promise<ProductRow | null> {
  const row = await db<ProductRow>("products").where({ id }).first();
  return row ?? null;
}


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
): Promise<{ id: number; isNew: boolean }> {
  const normalizedWa = digitsOnly(waId);
  const normalizedPhone = digitsOnly(phone ?? waId);
  const finalWa = normalizedWa || String(waId ?? "").trim();
  const finalPhone = normalizedPhone || String(phone ?? "").trim() || null;
  const incomingName = String(name ?? "").trim() || null;

  return db.transaction(async (trx) => {
    const candidates = await trx("customers")
      .where((qb: any) => {
        qb.where({ wa_id: waId });
        if (finalWa) {
          qb.orWhere({ wa_id: finalWa });
          qb.orWhere({ wa_id: `+${finalWa}` });
          qb.orWhereRaw("regexp_replace(coalesce(wa_id,''), '\\D', '', 'g') = ?", [finalWa]);
        }
        if (normalizedPhone) {
          qb.orWhereRaw("regexp_replace(coalesce(phone,''), '\\D', '', 'g') = ?", [normalizedPhone]);
        }
      })
      .orderBy("id", "asc")
      .select("id", "wa_id", "name", "phone");

    if (candidates.length === 0) {
      const [inserted] = await trx("customers")
        .insert({
          wa_id: finalWa,
          name: incomingName,
          phone: finalPhone,
        })
        .returning<{ id: number }[]>("id");
      return { id: inserted.id, isNew: true };
    }

    // Pick canonical: oldest match, then merge all others into it.
    const typedCandidates = candidates as any[];
    const canonical = typedCandidates[0];
    const duplicateIds = typedCandidates.slice(1).map((c: any) => c.id);
    await mergeCustomerRecordsTx(trx, canonical.id, duplicateIds);
    await consolidateConversationsForCustomerTx(trx, canonical.id);

    const bestExistingName = typedCandidates.reduce<string | null>(
      (acc, row: any) => pickBetterName(acc, row.name),
      null
    );
    const nextName = pickBetterName(bestExistingName, incomingName);

    const update: any = {};
    if (finalWa && finalWa !== String(canonical.wa_id ?? "").trim()) {
      update.wa_id = finalWa;
    }
    if (nextName !== (canonical.name ?? null)) {
      update.name = nextName;
    }
    if (finalPhone && finalPhone !== String(canonical.phone ?? "").trim()) {
      update.phone = finalPhone;
    }

    if (Object.keys(update).length > 0) {
      await trx("customers").where({ id: canonical.id }).update(update);
    }

    return { id: canonical.id, isNew: false };
  });
}

export async function getOrCreateConversation(customerId: number) {
  return getOrCreateConversationForPhone(customerId, null);
}

export async function getOrCreateConversationForPhone(
  customerId: number,
  phoneNumberId: string | null
) {
  return db.transaction(async (trx) => {
    const consolidated = await consolidateConversationsForCustomerTx(
      trx,
      customerId,
      phoneNumberId ?? null
    );
    if (consolidated.canonicalId) return consolidated.canonicalId;

    const [inserted] = await trx("conversations")
      .insert({
        customer_id: customerId,
        phone_number_id: phoneNumberId,
        agent_allowed: false,
      })
      .returning<{ id: number }[]>("id");

    return inserted.id;
  });
}

export async function reconcileCustomersAndConversations(): Promise<ReconcileStats> {
  return db.transaction(async (trx) => {
    const stats: ReconcileStats = {
      groups_merged: 0,
      customers_merged: 0,
      conversations_merged: 0,
      messages_moved: 0,
    };

    const rows = await trx("customers")
      .select("id", "wa_id", "phone", "name")
      .orderBy("id", "asc");

    const typedRows = rows as any[];
    const byKey = new Map<string, any[]>();
    for (const row of typedRows) {
      const key = digitsOnly(row.wa_id) || digitsOnly(row.phone);
      if (!key) continue;
      const arr = byKey.get(key) ?? [];
      arr.push(row);
      byKey.set(key, arr);
    }

    for (const [, group] of byKey) {
      if (group.length <= 1) continue;
      const canonical = group[0];
      const duplicateIds = group.slice(1).map((g) => g.id);
      const mergeResult = await mergeCustomerRecordsTx(trx, canonical.id, duplicateIds);
      const convoResult = await consolidateConversationsForCustomerTx(trx, canonical.id);

      stats.groups_merged += 1;
      stats.customers_merged += mergeResult.customersMerged;
      stats.conversations_merged += convoResult.conversationsMerged;
      stats.messages_moved += convoResult.messagesMoved;

      const bestName = group.reduce<string | null>(
        (acc, row) => pickBetterName(acc, row.name),
        null
      );
      if (bestName && bestName !== (canonical.name ?? null)) {
        await trx("customers").where({ id: canonical.id }).update({ name: bestName });
      }
    }

    return stats;
  });
}

/* ------------------------ WhatsApp phone numbers -------------------------- */

export async function upsertWhatsAppPhoneNumber(args: {
  phone_number_id: string;
  display_phone_number?: string | null;
  label?: string | null;
}): Promise<void> {
  if (!args.phone_number_id) return;

  const existing = await db("whatsapp_phone_numbers")
    .where({ phone_number_id: args.phone_number_id })
    .first();

  // If this is the first number ever, make it default.
  const anyRows = await db("whatsapp_phone_numbers").first();
  const shouldDefault = !anyRows;

  if (!existing) {
    await db("whatsapp_phone_numbers").insert({
      phone_number_id: args.phone_number_id,
      display_phone_number: args.display_phone_number ?? null,
      label: args.label ?? null,
      is_default: shouldDefault,
      updated_at: db.fn.now(),
    });
    return;
  }

  const patch: any = { updated_at: db.fn.now() };
  if (args.display_phone_number && args.display_phone_number !== existing.display_phone_number) {
    patch.display_phone_number = args.display_phone_number;
  }
  if (args.label && args.label !== existing.label) {
    patch.label = args.label;
  }

  // If there is no default row, promote this one.
  const hasDefault = await db("whatsapp_phone_numbers").where({ is_default: true }).first();
  if (!hasDefault) patch.is_default = true;

  if (Object.keys(patch).length > 1) {
    await db("whatsapp_phone_numbers")
      .where({ phone_number_id: args.phone_number_id })
      .update(patch);
  }
}

export async function listWhatsAppPhoneNumbers() {
  const rows = await db("whatsapp_phone_numbers")
    .select(
      "id",
      "phone_number_id",
      "display_phone_number",
      "label",
      "is_default",
      "created_at",
      "updated_at"
    )
    .orderBy([{ column: "is_default", order: "desc" }, { column: "id", order: "asc" }]);
  return rows;
}

export async function setDefaultWhatsAppPhoneNumber(phoneNumberId: string): Promise<void> {
  if (!phoneNumberId) return;
  await db.transaction(async (trx) => {
    await trx("whatsapp_phone_numbers").update({ is_default: false, updated_at: trx.fn.now() });
    await trx("whatsapp_phone_numbers")
      .where({ phone_number_id: phoneNumberId })
      .update({ is_default: true, updated_at: trx.fn.now() });
  });
}

export async function getDefaultWhatsAppPhoneNumberId(): Promise<string | null> {
  const row = await db("whatsapp_phone_numbers")
    .where({ is_default: true })
    .select("phone_number_id")
    .first();
  if (row?.phone_number_id) return row.phone_number_id as string;
  const any = await db("whatsapp_phone_numbers").select("phone_number_id").first();
  return (any?.phone_number_id as string | undefined) ?? null;
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
      message_kind: "freeform",
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
      "message_kind",
      "status_reason",
      "error_code",
      "error_title",
      "error_details",
      "template_key",
      "template_name",
      "template_language",
      "wa_message_id",
      "created_at",
    ]);

  return inserted;
}

export async function findMessageByWaMessageId(waMessageId: string) {
  if (!waMessageId) return null;
  const row = await db("messages")
    .where({ wa_message_id: waMessageId })
    .select(
      "id",
      "conversation_id",
      "wa_message_id",
      "direction",
      "type",
      "body",
      "status",
      "message_kind",
      "status_reason",
      "error_code",
      "error_title",
      "error_details",
      "template_key",
      "template_name",
      "template_language",
      "created_at"
    )
    .first();
  return row ?? null;
}

export async function insertOutboundMessage(
  conversationId: number,
  type: string,
  body: string,
  options?: {
    waMessageId?: string | null;
    status?: string | null;
    messageKind?: string | null;
    statusReason?: string | null;
    errorCode?: string | null;
    errorTitle?: string | null;
    errorDetails?: string | null;
    templateKey?: string | null;
    templateName?: string | null;
    templateLanguage?: string | null;
  }
) {
  const [inserted] = await db("messages")
    .insert({
      conversation_id: conversationId,
      wa_message_id: options?.waMessageId ?? null,
      direction: "out",
      type,
      body,
      status: options?.status ?? "pending",
      message_kind: options?.messageKind ?? "freeform",
      status_reason: options?.statusReason ?? null,
      error_code: options?.errorCode ?? null,
      error_title: options?.errorTitle ?? null,
      error_details: options?.errorDetails ?? null,
      template_key: options?.templateKey ?? null,
      template_name: options?.templateName ?? null,
      template_language: options?.templateLanguage ?? null,
    })
    .returning([
      "id",
      "conversation_id",
      "wa_message_id",
      "direction",
      "type",
      "body",
      "status",
      "message_kind",
      "status_reason",
      "error_code",
      "error_title",
      "error_details",
      "template_key",
      "template_name",
      "template_language",
      "created_at",
    ]);

  return inserted;
}

export const FREE_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ConversationWindowState = {
  mode: "freeform" | "template_required";
  lastInboundAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number | null;
  reason: "within_24h" | "outside_24h" | "no_inbound_history";
};

export function resolveConversationWindowStateFromLastInbound(
  lastInboundAt: string | null | undefined,
  now = Date.now()
): ConversationWindowState {
  if (!lastInboundAt) {
    return {
      mode: "template_required",
      lastInboundAt: null,
      expiresAt: null,
      remainingSeconds: null,
      reason: "no_inbound_history",
    };
  }

  const openedAt = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(openedAt)) {
    return {
      mode: "template_required",
      lastInboundAt: null,
      expiresAt: null,
      remainingSeconds: null,
      reason: "no_inbound_history",
    };
  }

  const expiresAtMs = openedAt + FREE_REPLY_WINDOW_MS;
  const remainingMs = Math.max(0, expiresAtMs - now);
  const withinWindow = expiresAtMs > now;

  return {
    mode: withinWindow ? "freeform" : "template_required",
    lastInboundAt: new Date(openedAt).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    remainingSeconds: Math.floor(remainingMs / 1000),
    reason: withinWindow ? "within_24h" : "outside_24h",
  };
}

export async function getConversationLastInboundAt(conversationId: number): Promise<string | null> {
  const row = await db("conversations")
    .where({ id: conversationId })
    .select("last_user_message_at")
    .first();

  return (row?.last_user_message_at as string | null | undefined) ?? null;
}

export async function getConversationWindowState(
  conversationId: number,
  now = Date.now()
): Promise<ConversationWindowState> {
  return resolveConversationWindowStateFromLastInbound(
    await getConversationLastInboundAt(conversationId),
    now
  );
}

export async function canSendFreeform(conversationId: number): Promise<boolean> {
  return (await getConversationWindowState(conversationId)).mode === "freeform";
}

export async function requiresTemplate(conversationId: number): Promise<boolean> {
  return (await getConversationWindowState(conversationId)).mode === "template_required";
}

export type TemplateSendEventRow = {
  id: number;
  conversation_id: number;
  message_id: number | null;
  customer_id: number | null;
  template_key: string | null;
  template_name: string | null;
  template_language: string | null;
  template_category: string | null;
  window_mode_at_send: string;
  send_status: string;
  wa_message_id: string | null;
  error_code: string | null;
  error_title: string | null;
  error_details: string | null;
  trigger_source: string;
  actor_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export async function createTemplateSendEvent(input: {
  conversationId: number;
  messageId?: number | null;
  customerId?: number | null;
  templateKey?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateCategory?: string | null;
  windowModeAtSend: ConversationWindowState["mode"];
  sendStatus: string;
  waMessageId?: string | null;
  errorCode?: string | null;
  errorTitle?: string | null;
  errorDetails?: string | null;
  triggerSource: string;
  actorUserId?: number | null;
}) {
  const [inserted] = await db("template_send_events")
    .insert({
      conversation_id: input.conversationId,
      message_id: input.messageId ?? null,
      customer_id: input.customerId ?? null,
      template_key: input.templateKey ?? null,
      template_name: input.templateName ?? null,
      template_language: input.templateLanguage ?? null,
      template_category: input.templateCategory ?? null,
      window_mode_at_send: input.windowModeAtSend,
      send_status: input.sendStatus,
      wa_message_id: input.waMessageId ?? null,
      error_code: input.errorCode ?? null,
      error_title: input.errorTitle ?? null,
      error_details: input.errorDetails ?? null,
      trigger_source: input.triggerSource,
      actor_user_id: input.actorUserId ?? null,
    })
    .returning("*");

  return (inserted ?? null) as TemplateSendEventRow | null;
}

export async function updateTemplateSendEvent(
  id: number,
  input: {
    messageId?: number | null;
    sendStatus?: string;
    waMessageId?: string | null;
    errorCode?: string | null;
    errorTitle?: string | null;
    errorDetails?: string | null;
  }
) {
  const patch: Record<string, unknown> = {
    updated_at: db.fn.now(),
  };

  if (input.messageId !== undefined) patch.message_id = input.messageId;
  if (input.sendStatus !== undefined) patch.send_status = input.sendStatus;
  if (input.waMessageId !== undefined) patch.wa_message_id = input.waMessageId;
  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.errorTitle !== undefined) patch.error_title = input.errorTitle;
  if (input.errorDetails !== undefined) patch.error_details = input.errorDetails;

  const [updated] = await db("template_send_events")
    .where({ id })
    .update(patch)
    .returning("*");

  return (updated ?? null) as TemplateSendEventRow | null;
}

export async function updateMessageTransportState(
  messageId: number,
  input: {
    waMessageId?: string | null;
    status?: string | null;
    messageKind?: string | null;
    statusReason?: string | null;
    errorCode?: string | null;
    errorTitle?: string | null;
    errorDetails?: string | null;
    templateKey?: string | null;
    templateName?: string | null;
    templateLanguage?: string | null;
  }
) {
  const patch: Record<string, unknown> = {};

  if (input.waMessageId !== undefined) patch.wa_message_id = input.waMessageId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.messageKind !== undefined) patch.message_kind = input.messageKind;
  if (input.statusReason !== undefined) patch.status_reason = input.statusReason;
  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.errorTitle !== undefined) patch.error_title = input.errorTitle;
  if (input.errorDetails !== undefined) patch.error_details = input.errorDetails;
  if (input.templateKey !== undefined) patch.template_key = input.templateKey;
  if (input.templateName !== undefined) patch.template_name = input.templateName;
  if (input.templateLanguage !== undefined) patch.template_language = input.templateLanguage;

  const [updated] = await db("messages")
    .where({ id: messageId })
    .update(patch)
    .returning([
      "id",
      "conversation_id",
      "wa_message_id",
      "direction",
      "type",
      "body",
      "status",
      "message_kind",
      "status_reason",
      "error_code",
      "error_title",
      "error_details",
      "template_key",
      "template_name",
      "template_language",
      "created_at",
    ]);

  return updated ?? null;
}

export async function updateMessageTransportStateByWaMessageId(
  waMessageId: string,
  input: {
    status?: string | null;
    statusReason?: string | null;
    errorCode?: string | null;
    errorTitle?: string | null;
    errorDetails?: string | null;
  }
) {
  if (!waMessageId) return null;

  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.statusReason !== undefined) patch.status_reason = input.statusReason;
  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.errorTitle !== undefined) patch.error_title = input.errorTitle;
  if (input.errorDetails !== undefined) patch.error_details = input.errorDetails;

  const [updated] = await db("messages")
    .where({ wa_message_id: waMessageId })
    .update(patch)
    .returning([
      "id",
      "conversation_id",
      "wa_message_id",
      "direction",
      "type",
      "body",
      "status",
      "message_kind",
      "status_reason",
      "error_code",
      "error_title",
      "error_details",
      "template_key",
      "template_name",
      "template_language",
      "created_at",
    ]);

  return updated ?? null;
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

export async function listConversations(opts: {
  limit: number;
  offset: number;
  search?: string;
}) {
  const { limit, offset, search } = opts;

  const q = db("conversations as c")
    .join("customers as cu", "c.customer_id", "cu.id")
    .leftJoin("messages as m", "m.id", "c.last_message_id")
    .select(
      "c.id",
      "cu.name",
      "cu.phone",
      "cu.lang",
      "c.agent_allowed",
      "c.last_user_message_at",
      "c.unread_count",
      "m.body as last_message_text",
      "m.created_at as last_message_at"
    )
    .orderBy("c.last_user_message_at", "desc")
    .limit(limit)
    .offset(offset);

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    q.where(function () {
      this.where("cu.name", "ilike", term)
        .orWhere("cu.phone", "ilike", term)
        .orWhere("m.body", "ilike", term);
    });
  }

  return q;
}


export async function listMessages(conversationId: number, limit = 500) {
  return db("messages")
    .where({ conversation_id: conversationId })
    .select(
      "id",
      "conversation_id",
      "wa_message_id",
      "direction",
      "type",
      "body",
      "status",
      "message_kind",
      "status_reason",
      "error_code",
      "error_title",
      "error_details",
      "template_key",
      "template_name",
      "template_language",
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
    // Keep this write bundle atomic. The chatbot, inbox, and admin order views
    // all assume orders, items, payments, and incomes stay in sync.
    // 0) Resolve products by SKU so we can store product_id on order_items
    const skus = Array.from(
      new Set(
        (input.items ?? [])
          .map((it) => it.sku)
          .filter((sku): sku is string => typeof sku === "string" && sku.trim().length > 0)
      )
    );

    const productBySku = new Map<string, { id: number }>();
    if (skus.length > 0) {
      const productRows = await trx("products")
        .whereIn("sku", skus)
        .select<{ id: number; sku: string }[]>("id", "sku");

      for (const p of productRows) {
        if (!p.sku) continue;
        productBySku.set(p.sku, { id: p.id });
      }
    }

    // 1) Generate order code and insert the order (status starts as pending or given)
    const orderCode = await generateOrderCode(trx);

    const [order] = await trx("orders")
      .insert({
        customer_id: input.customerId,
        status: input.status ?? "pending", // default pending
        delivery_mode: input.deliveryMode, // pickup | delivery
        km: input.km ?? null,
        fee_tzs: input.feeTzs,
        total_tzs: input.totalTzs,
        phone: input.phone ?? null,
        region: input.region ?? null,
        lat: input.lat ?? null,
        lon: input.lon ?? null,
        order_code: orderCode,
      })
      .returning<{ id: number }[]>("id");

    const orderId = order.id;

    // 2) Insert order_items (linking to product_id where possible, but NO stock change here)
    if (input.items && input.items.length > 0) {
      const itemRows = input.items.map((it) => {
        const prod = it.sku ? productBySku.get(it.sku) : undefined;
        return {
          order_id: orderId,
          product_id: prod ? prod.id : null,
          sku: it.sku,
          name: it.name,
          qty: it.qty,
          unit_price_tzs: it.unitPrice,
        };
      });

      await trx("order_items").insert(itemRows);
    }

    // 3) Create initial payment row (status "awaiting")
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

    // 4) Create an income row as "pending" so it shows in Income page
    const incomeAmount = Math.max(0, Math.floor(input.totalTzs ?? 0));
    if (incomeAmount > 0) {
      await trx("incomes").insert({
        order_id: orderId,
        amount_tzs: incomeAmount,
        status: "pending",
        source: "order",
        description: `Auto: ${orderCode}`,
        recorded_at: new Date(),
      });
    }

    await trx("order_events").insert({
      order_id: orderId,
      payment_id: payment.id,
      customer_id: input.customerId,
      event_type: "order.created",
      actor_type: "system",
      source: "checkout",
      dedupe_key: `order-created:${orderId}`,
      payload_json: {
        status: input.status ?? "pending",
        delivery_mode: input.deliveryMode,
        total_tzs: input.totalTzs,
        fee_tzs: input.feeTzs,
        payment_status: "awaiting",
        item_count: input.items.length,
        order_code: orderCode,
      },
    });

    return {
      orderId,
      orderCode,
      paymentId: payment.id,
    };
  });
}

export async function findLatestPaymentForOrder(orderId: number, trx: any = db) {
  return trx("payments")
    .where({ order_id: orderId })
    .orderBy("created_at", "desc")
    .first();
}

export async function submitPaymentProof(args: {
  orderId: number;
  paymentId?: number | null;
  customerId?: number | null;
  conversationId?: number | null;
  messageId?: number | null;
  proofType: "text" | "image";
  proofText?: string | null;
  proofUrl?: string | null;
  proofMessageId?: string | null;
  source?: string | null;
}) {
  const normalizedProofText = String(args.proofText ?? "").trim();
  const proofFingerprint = args.proofType === "text"
    ? hashValue(normalizedProofText.toLowerCase())
    : hashValue(String(args.proofUrl ?? args.proofMessageId ?? args.messageId ?? args.orderId));
  const dedupeKey = `payment-proof:${args.orderId}:${args.proofType}:${proofFingerprint}`;

  return db.transaction(async (trx) => {
    const order = await trx("orders")
      .where({ id: args.orderId })
      .first("id", "customer_id", "status");

    if (!order) {
      throw new Error("order_not_found");
    }

    const payment =
      (args.paymentId
        ? await trx("payments").where({ id: args.paymentId }).first()
        : await findLatestPaymentForOrder(args.orderId, trx)) ?? null;

    if (!payment) {
      throw new Error("payment_not_found");
    }

    const auditResult = await appendOrderEventUsing(trx, {
      orderId: args.orderId,
      paymentId: payment.id,
      customerId: args.customerId ?? order.customer_id ?? null,
      conversationId: args.conversationId ?? null,
      messageId: args.messageId ?? null,
      eventType: "payment.proof_submitted",
      actorType: "customer",
      source: args.source ?? "whatsapp",
      dedupeKey,
      payload: {
        proof_type: args.proofType,
        proof_message_id: args.proofMessageId ?? null,
        proof_text_preview:
          args.proofType === "text" ? normalizedProofText.slice(0, 120) : null,
        proof_url: args.proofType === "image" ? args.proofUrl ?? null : null,
      },
    });

    if (auditResult.duplicate) {
      return {
        duplicate: true as const,
        order,
        payment,
      };
    }

    const paymentPatch: Record<string, any> = {
      updated_at: trx.fn.now(),
      proof_submitted_at: trx.fn.now(),
      proof_message_id: args.proofMessageId ?? null,
    };

    if (args.proofType === "text") {
      paymentPatch.proof_text = normalizedProofText;
    }
    if (args.proofType === "image" && args.proofUrl) {
      paymentPatch.proof_url = args.proofUrl;
    }
    if (payment.status !== "paid") {
      paymentPatch.status = "verifying";
    }

    await trx("payments").where({ id: payment.id }).update(paymentPatch);

    if (canTransitionOrderStatus(order.status ?? "pending", "verifying")) {
      await trx("orders")
        .where({ id: args.orderId })
        .update({ status: "verifying", updated_at: trx.fn.now() });
    }

    return {
      duplicate: false as const,
      order: {
        ...order,
        status: canTransitionOrderStatus(order.status ?? "pending", "verifying")
          ? "verifying"
          : order.status,
      },
      payment: {
        ...payment,
        ...paymentPatch,
      },
    };
  });
}

export async function applyPaymentStatusUpdate(args: {
  paymentId: number;
  nextStatus: PaymentStatus;
  amountToAddTzs?: number | null;
  reason?: string | null;
  actorUserId?: number | null;
  actorEmail?: string | null;
  source?: string | null;
}) {
  return db.transaction(async (trx) => {
    const row = await trx("payments as p")
      .leftJoin("orders as o", "o.id", "p.order_id")
      .leftJoin("customers as u", "u.id", "o.customer_id")
      .where("p.id", args.paymentId)
      .select(
        "p.id",
        "p.status as payment_status",
        "p.amount_tzs",
        "p.order_id",
        "o.status as order_status",
        "o.total_tzs",
        "o.order_code",
        "o.customer_id",
        "u.wa_id",
        "u.lang"
      )
      .first();

    if (!row) {
      throw new Error("payment_not_found");
    }

    const currentStatus = String(row.payment_status ?? "awaiting");
    assertPaymentStatusTransition(currentStatus, args.nextStatus);

    const update: Record<string, any> = {
      status: args.nextStatus,
      status_reason: args.reason ?? null,
      updated_at: trx.fn.now(),
    };

    let justAdded = 0;
    if (args.nextStatus === "paid") {
      const amountToAdd = Number(args.amountToAddTzs ?? 0);
      if (!Number.isFinite(amountToAdd) || amountToAdd <= 0) {
        throw new Error("amount_tzs_required_for_paid");
      }

      justAdded = amountToAdd;
      update.amount_tzs = accumulatePaymentAmount(row.amount_tzs, amountToAdd);
    }

    if (
      args.nextStatus !== "paid" &&
      currentStatus === args.nextStatus &&
      String(row.amount_tzs ?? 0) === String(update.amount_tzs ?? row.amount_tzs ?? 0)
    ) {
      return {
        duplicate: true as const,
        row,
        justAdded,
        newAmountTotal: Number(row.amount_tzs ?? 0) || 0,
        remaining: computeRemainingPayment(row.total_tzs, row.amount_tzs),
      };
    }

    await trx("payments").where({ id: args.paymentId }).update(update);

    await appendOrderEventUsing(trx, {
      orderId: row.order_id,
      paymentId: args.paymentId,
      customerId: row.customer_id,
      eventType: "payment.status_changed",
      actorType: args.actorEmail || args.actorUserId ? "admin" : "system",
      actorUserId: args.actorUserId ?? null,
      actorEmail: args.actorEmail ?? null,
      source: args.source ?? "admin",
      payload: {
        previous_status: currentStatus,
        next_status: args.nextStatus,
        just_added_tzs: justAdded || null,
        new_total_paid_tzs:
          args.nextStatus === "paid"
            ? update.amount_tzs
            : Number(row.amount_tzs ?? 0) || 0,
        reason: args.reason ?? null,
      },
    });

    return {
      duplicate: false as const,
      row,
      justAdded,
      newAmountTotal:
        args.nextStatus === "paid"
          ? Number(update.amount_tzs ?? 0)
          : Number(row.amount_tzs ?? 0) || 0,
      remaining: computeRemainingPayment(
        row.total_tzs,
        args.nextStatus === "paid" ? update.amount_tzs : row.amount_tzs
      ),
    };
  });
}

export async function applyOrderStatusAudit(args: {
  orderId: number;
  previousStatus: DbOrderStatus;
  nextStatus: DbOrderStatus;
  actorUserId?: number | null;
  actorEmail?: string | null;
  source?: string | null;
  payload?: any;
}) {
  assertOrderStatusTransition(args.previousStatus, args.nextStatus);
  return appendOrderEvent({
    orderId: args.orderId,
    eventType: "order.status_changed",
    actorType: args.actorEmail || args.actorUserId ? "admin" : "system",
    actorUserId: args.actorUserId ?? null,
    actorEmail: args.actorEmail ?? null,
    source: args.source ?? "admin",
    payload: {
      previous_status: args.previousStatus,
      next_status: args.nextStatus,
      ...(args.payload ?? {}),
    },
  });
}

export async function auditOrderPaymentModeUpdate(args: {
  orderId: number;
  paymentMode: "prepay" | "cod";
  source?: string | null;
}) {
  return appendOrderEvent({
    orderId: args.orderId,
    eventType: "order.payment_mode_updated",
    actorType: "customer",
    source: args.source ?? "whatsapp",
    payload: {
      payment_mode: args.paymentMode,
    },
  });
}


export async function createManualOrderFromSkus(input: {
  customerId: number;
  phone: string;
  deliveryMode: "pickup" | "delivery";
  region: string | null;
  locationType: "within" | "outside";
  items: { sku: string; qty: number }[];
}) {
  if (!input.items || input.items.length === 0) {
    throw new Error("No items provided");
  }

  // Fetch products for all SKUs
  const skus = input.items.map((i) => i.sku);
  const products = await db("products").whereIn("sku", skus);

  // Build order items with prices from DB
  const orderItems = input.items.map((i) => {
    const product = products.find((p: any) => p.sku === i.sku);
    if (!product) {
      throw new Error(`Unknown product SKU: ${i.sku}`);
    }
    const qty = Number(i.qty) || 1;
    return {
      sku: product.sku,
      name: product.name,
      qty,
      unitPrice: Number(product.price_tzs),
    };
  });

  const totalTzs = orderItems.reduce(
    (sum, item) => sum + item.qty * item.unitPrice,
    0
  );

  // You can later put delivery fees based on locationType.
  const feeTzs = 0; // for now, no extra fee

  const { orderId, orderCode } = await createOrderWithPayment({
    customerId: input.customerId,
    status: "pending",
    deliveryMode: input.deliveryMode,
    km: null, // we don't use km for manual orders
    feeTzs,
    totalTzs,
    phone: input.phone,
    region: input.region,
    lat: null,
    lon: null,
    items: orderItems,
  });

  return { orderId, orderCode, totalTzs };
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

/* ---------------------- Outstanding order balances ------------------------ */

export interface OutstandingOrderRow {
  id: number;
  customer_id: number;
  status: string | null;
  total_tzs: number;
  created_at: Date;
  order_code: string | null;
  paid_amount: number;
  remaining: number;
}

export async function listOutstandingOrdersForCustomer(
  customerId: number
): Promise<OutstandingOrderRow[]> {
  const rows = await db("orders as o")
    .leftJoin("payments as p", "p.order_id", "o.id")
    .where("o.customer_id", customerId)
    .whereNull("o.deleted_at")
    .groupBy("o.id")
    .select(
      "o.id",
      "o.customer_id",
      "o.status",
      "o.total_tzs",
      "o.created_at",
      "o.order_code",
      db.raw(
        "COALESCE(SUM(CASE WHEN p.status IN ('paid', 'completed') THEN p.amount_tzs ELSE 0 END), 0) as paid_amount"
      )
    );

  return rows
    .map((row: any) => {
      const total = Number(row.total_tzs) || 0;
      const paid = Number(row.paid_amount) || 0;
      const remaining = total - paid;
      return { ...row, paid_amount: paid, remaining };
    })
    .filter((r) => r.remaining > 0)
    .sort((a, b) => {
      return (b.created_at as any) - (a.created_at as any);
    });
}

// UPDATE: set payment_mode for an existing order
export async function updateOrderPaymentMode(
  orderId: number,
  paymentMode: "prepay" | "cod"
): Promise<void> {
  await db("orders")
    .where({ id: orderId })
    .update({
      payment_mode: paymentMode,
      updated_at: db.fn.now(),
    });

  await auditOrderPaymentModeUpdate({
    orderId,
    paymentMode,
    source: "whatsapp",
  });
}
