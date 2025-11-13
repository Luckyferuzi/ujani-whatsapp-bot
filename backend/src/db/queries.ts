// backend/src/db/queries.ts
//
// Central DB helpers used by webhook + admin inbox.
// Adjust table/column names if your schema differs a bit.

import db from "./knex.js";

/**
 * Types for convenience
 */

export type CustomerRow = {
  id: number;
  wa_id: string;          // WhatsApp ID / phone
  phone: string | null;
  name: string | null;
  lang: string | null;
  created_at: string;
};

export type ConversationRow = {
  id: number;
  customer_id: number;
  agent_allowed: boolean;
  mode: "bot" | "agent";
  last_user_message_at: string | null;
  created_at: string;
};

export type InsertMsg = {
  type: string;
  body: string;
  status?: string | null;
};

/**
 * Ensure we have a customer row for this WhatsApp ID.
 *
 * - waId: WhatsApp "wa_id" (string from webhook)
 * - name: profile name (can be null)
 * - phone: same as waId for most setups
 *
 * Returns: customer.id
 */
export async function upsertCustomerByWa(
  waId: string,
  name: string | null,
  phone: string | null,
  lang?: string | null
): Promise<number> {
  if (!waId) {
    throw new Error("upsertCustomerByWa requires waId");
  }

  // Try to find existing
  const existing = await db<CustomerRow>("customers")
    .where({ wa_id: waId })
    .first();

  if (existing) {
    // Update basic info if something new came in
    const patch: Partial<CustomerRow> = {};
    if (name && name !== existing.name) patch.name = name;
    if (phone && phone !== existing.phone) patch.phone = phone;
    if (lang && lang !== existing.lang) patch.lang = lang;

    if (Object.keys(patch).length) {
      await db("customers").where({ id: existing.id }).update(patch);
    }

    return existing.id;
  }

  // Create new
  const [row] = await db("customers")
    .insert({
      wa_id: waId,
      phone: phone ?? waId,
      name: name ?? null,
      lang: lang ?? null,
    })
    .returning<Pick<CustomerRow, "id">[]>("id");

  return row.id;
}

/**
 * Get or create a conversation for this customer.
 *
 * For now we use a single "active" conversation per customer.
 * If you want multiple, adjust this logic.
 */
export async function getOrCreateConversation(
  customerId: number
): Promise<number> {
  const existing = await db<ConversationRow>("conversations")
    .where({ customer_id: customerId })
    .orderBy("created_at", "desc")
    .first();

  if (existing) return existing.id;

  const [row] = await db("conversations")
    .insert({
      customer_id: customerId,
      agent_allowed: false,
      mode: "bot",
    })
    .returning<Pick<ConversationRow, "id">[]>("id");

  return row.id;
}

/**
 * Insert inbound (customer) message.
 */
export async function insertInboundMessage(
  conversationId: number,
  msg: InsertMsg
): Promise<void> {
  await db("messages").insert({
    conversation_id: conversationId,
    direction: "in",
    type: msg.type,
    body: msg.body,
    status: msg.status ?? null,
  });
}

/**
 * Insert outbound (bot/agent) message.
 */
export async function insertOutboundMessage(
  conversationId: number,
  msg: InsertMsg
): Promise<void> {
  await db("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    type: msg.type,
    body: msg.body,
    status: msg.status ?? "sent",
  });
}

/**
 * Update the last time the customer sent a message.
 * Used for sorting conversations and for your "latest options" logic.
 */
export async function updateConversationLastUserAt(
  conversationId: number,
  at: Date
): Promise<void> {
  await db("conversations")
    .where({ id: conversationId })
    .update({ last_user_message_at: at });
}

/**
 * Convenience: read conversation + customer in one go.
 * Not strictly required, but can be handy.
 */
export async function getConversationWithCustomer(
  conversationId: number
): Promise<(ConversationRow & { customer: CustomerRow | null }) | null> {
  const row = await db("conversations as c")
    .leftJoin("customers as u", "u.id", "c.customer_id")
    .where("c.id", conversationId)
    .select(
      "c.id as c_id",
      "c.customer_id as c_customer_id",
      "c.agent_allowed as c_agent_allowed",
      "c.mode as c_mode",
      "c.last_user_message_at as c_last_user_message_at",
      "c.created_at as c_created_at",
      "u.id as u_id",
      "u.wa_id as u_wa_id",
      "u.phone as u_phone",
      "u.name as u_name",
      "u.lang as u_lang",
      "u.created_at as u_created_at"
    )
    .first();

  if (!row) return null;

  const conversation: ConversationRow = {
    id: row.c_id,
    customer_id: row.c_customer_id,
    agent_allowed: row.c_agent_allowed,
    mode: row.c_mode,
    last_user_message_at: row.c_last_user_message_at,
    created_at: row.c_created_at,
  };

  const customer: CustomerRow | null = row.u_id
    ? {
        id: row.u_id,
        wa_id: row.u_wa_id,
        phone: row.u_phone,
        name: row.u_name,
        lang: row.u_lang,
        created_at: row.u_created_at,
      }
    : null;

  return { ...conversation, customer };
}

/**
 * Convenience: flip agent_allowed and mode in the conversation.
 * This is what we use for ACTION_TALK_TO_AGENT and ACTION_RETURN_TO_BOT.
 */
export async function setConversationMode(
  conversationId: number,
  agentAllowed: boolean,
  mode: "bot" | "agent"
): Promise<void> {
  await db("conversations")
    .where({ id: conversationId })
    .update({ agent_allowed: agentAllowed, mode });
}
