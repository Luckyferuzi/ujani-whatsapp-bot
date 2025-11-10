import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('customers', t => {
    t.index(['wa_id']);
    t.index(['phone']);
    t.index(['created_at']);
  });
  await knex.schema.alterTable('conversations', t => {
    t.index(['customer_id']);
    t.index(['last_user_message_at']);
    t.index(['created_at']);
    t.index(['agent_allowed']);
  });
  await knex.schema.alterTable('messages', t => {
    t.index(['conversation_id', 'created_at']);
    t.index(['wa_message_id']);
    t.index(['direction']);
  });
  await knex.schema.alterTable('orders', t => {
    t.index(['customer_id', 'created_at']);
    t.index(['status']);
  });
  await knex.schema.alterTable('payments', t => {
    t.index(['order_id', 'status']);
    t.index(['created_at']);
  });
}

export async function down(_knex: Knex): Promise<void> {
  // noop — dropping indexes is optional
}
