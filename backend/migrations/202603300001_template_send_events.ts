import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("template_send_events");
  if (exists) return;

  await knex.schema.createTable("template_send_events", (table) => {
    table.increments("id").primary();
    table
      .integer("conversation_id")
      .notNullable()
      .references("id")
      .inTable("conversations")
      .onDelete("CASCADE");
    table
      .integer("message_id")
      .nullable()
      .references("id")
      .inTable("messages")
      .onDelete("SET NULL");
    table
      .integer("customer_id")
      .nullable()
      .references("id")
      .inTable("customers")
      .onDelete("SET NULL");
    table.string("template_key").nullable();
    table.string("template_name").nullable();
    table.string("template_language").nullable();
    table.string("template_category").nullable();
    table.string("window_mode_at_send").notNullable();
    table.string("send_status").notNullable();
    table.string("wa_message_id").nullable();
    table.string("error_code").nullable();
    table.string("error_title").nullable();
    table.text("error_details").nullable();
    table.string("trigger_source").notNullable();
    table
      .integer("actor_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index(["conversation_id"], "idx_template_send_events_conversation");
    table.index(["message_id"], "idx_template_send_events_message");
    table.index(["customer_id"], "idx_template_send_events_customer");
    table.index(["template_key"], "idx_template_send_events_template_key");
    table.index(["send_status"], "idx_template_send_events_send_status");
    table.index(["created_at"], "idx_template_send_events_created_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("template_send_events");
  if (!exists) return;
  await knex.schema.dropTable("template_send_events");
}
