import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("payments", (table) => {
    table.text("proof_text").nullable();
    table.string("proof_message_id").nullable();
    table.timestamp("proof_submitted_at").nullable();
    table.text("status_reason").nullable();
    table.timestamp("updated_at").nullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("order_events", (table) => {
    table.increments("id").primary();
    table.integer("order_id").references("orders.id").onDelete("CASCADE").nullable();
    table.integer("payment_id").references("payments.id").onDelete("CASCADE").nullable();
    table.integer("customer_id").references("customers.id").onDelete("CASCADE").nullable();
    table.integer("conversation_id").references("conversations.id").onDelete("SET NULL").nullable();
    table.integer("message_id").references("messages.id").onDelete("SET NULL").nullable();
    table.string("event_type").notNullable();
    table.string("actor_type").notNullable().defaultTo("system");
    table.integer("actor_user_id").nullable();
    table.string("actor_email").nullable();
    table.string("source").nullable();
    table.string("dedupe_key").nullable().unique();
    table.jsonb("payload_json").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["order_id", "created_at"], "order_events_order_created_idx");
    table.index(["payment_id", "created_at"], "order_events_payment_created_idx");
    table.index(["event_type", "created_at"], "order_events_type_created_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("order_events");

  await knex.schema.alterTable("payments", (table) => {
    table.dropColumn("proof_text");
    table.dropColumn("proof_message_id");
    table.dropColumn("proof_submitted_at");
    table.dropColumn("status_reason");
    table.dropColumn("updated_at");
  });
}
