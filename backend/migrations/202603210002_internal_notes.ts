import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("internal_notes", (table) => {
    table.increments("id").primary();
    table.string("scope").notNullable();
    table.integer("conversation_id").references("conversations.id").onDelete("CASCADE").nullable();
    table.integer("order_id").references("orders.id").onDelete("CASCADE").nullable();
    table.integer("customer_id").references("customers.id").onDelete("CASCADE").nullable();
    table.text("body").notNullable();
    table.integer("created_by_user_id").nullable();
    table.string("created_by_email").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["conversation_id", "created_at"], "internal_notes_conversation_created_idx");
    table.index(["order_id", "created_at"], "internal_notes_order_created_idx");
    table.index(["customer_id", "created_at"], "internal_notes_customer_created_idx");
    table.index(["scope", "created_at"], "internal_notes_scope_created_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("internal_notes");
}
