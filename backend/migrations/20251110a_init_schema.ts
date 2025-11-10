import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('customers', t => {
    t.increments('id').primary();
    t.string('wa_id').unique();
    t.string('name');
    t.string('phone');
    t.string('lang');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('conversations', t => {
    t.increments('id').primary();
    t.integer('customer_id').references('customers.id').onDelete('CASCADE');
    t.string('mode');
    t.boolean('agent_allowed').defaultTo(false);
    t.timestamp('last_user_message_at');
    t.string('source');
    t.string('referral_click_id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('messages', t => {
    t.increments('id').primary();
    t.integer('conversation_id').references('conversations.id').onDelete('CASCADE');
    t.string('wa_message_id');
    t.string('direction'); // inbound | outbound
    t.string('type');      // text | image | interactive | etc.
    t.text('body');
    t.string('status');    // delivered | read | etc
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('orders', t => {
    t.increments('id').primary();
    t.integer('customer_id').references('customers.id').onDelete('CASCADE');
    t.string('status');         // pending | verifying | paid | failed
    t.string('delivery_mode');  // pickup | delivery
    t.float('km');
    t.integer('fee_tzs');
    t.integer('total_tzs');
    t.string('phone');
    t.string('region');
    t.float('lat');
    t.float('lon');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('order_items', t => {
    t.increments('id').primary();
    t.integer('order_id').references('orders.id').onDelete('CASCADE');
    t.string('sku');
    t.string('name');
    t.integer('qty');
    t.integer('unit_price_tzs');
  });

  await knex.schema.createTable('payments', t => {
    t.increments('id').primary();
    t.integer('order_id').references('orders.id').onDelete('CASCADE');
    t.string('method');
    t.string('reference');
    t.string('proof_url');
    t.string('status'); // verifying | confirmed | failed
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('opt_ins', t => {
    t.increments('id').primary();
    t.integer('customer_id').references('customers.id').onDelete('CASCADE');
    t.string('channel');
    t.string('source');
    t.timestamp('granted_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('opt_ins');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('messages');
  await knex.schema.dropTableIfExists('conversations');
  await knex.schema.dropTableIfExists('customers');
}
