import db from './knex';

export async function upsertCustomerByWa(waId: string, name?: string | null, phone?: string | null) {
  const existing = await db('customers').where({ wa_id: waId }).first();
  if (existing) return existing.id as number;
  const inserted = await db('customers').insert({ wa_id: waId, name, phone }).returning<{ id: number }[]>('id');
  return inserted[0].id;
}

export async function getOrCreateConversation(customerId: number) {
  const existing = await db('conversations').where({ customer_id: customerId }).orderBy('id','desc').first();
  if (existing) return existing.id as number;
  const inserted = await db('conversations').insert({ customer_id: customerId, agent_allowed: false }).returning<{ id: number }[]>('id');
  return inserted[0].id;
}

export async function insertInboundMessage(conversationId: number, waMessageId: string | null, type: string, body: string | null) {
  const inserted = await db('messages').insert({
    conversation_id: conversationId,
    wa_message_id: waMessageId ?? null,
    direction: 'inbound',
    type,
    body
  }).returning(['id','conversation_id','direction','type','body','status','created_at']);
  return inserted[0];
}

export async function insertOutboundMessage(conversationId: number, type: string, body: string) {
  const inserted = await db('messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    type,
    body
  }).returning(['id','conversation_id','direction','type','body','status','created_at']);
  return inserted[0];
}

export async function updateConversationLastUserAt(conversationId: number) {
  await db('conversations').where({ id: conversationId }).update({ last_user_message_at: db.fn.now() });
}

export async function findConversationRecipientWa(conversationId: number) {
  const row = await db('conversations as c')
    .leftJoin('customers as cu', 'cu.id', 'c.customer_id')
    .where('c.id', conversationId)
    .select<{ wa_id: string }>('cu.wa_id')
    .first();
  return row?.wa_id;
}

export async function listConversations(limit = 200) {
  return db('conversations as c')
    .leftJoin('customers as cu', 'cu.id', 'c.customer_id')
    .select('c.id', 'c.last_user_message_at', 'cu.name', 'cu.phone')
    .orderBy([{ column:'c.last_user_message_at', order:'desc', nulls:'last' }, { column:'c.created_at', order:'desc' }])
    .limit(limit);
}

export async function listMessages(conversationId: number, limit = 500) {
  return db('messages')
    .where({ conversation_id: conversationId })
    .select('id','conversation_id','direction','type','body','status','created_at')
    .orderBy('created_at','asc')
    .limit(limit);
}
