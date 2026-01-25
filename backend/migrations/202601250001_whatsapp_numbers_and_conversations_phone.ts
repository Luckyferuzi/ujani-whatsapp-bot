import type { Knex } from "knex";

// Adds multi-number support for a single business (single-tenant).
//
// - whatsapp_phone_numbers: tracks all connected phone_number_id values under the same WABA
// - conversations.phone_number_id: tracks which business number a customer used

export async function up(knex: Knex): Promise<void> {
  const hasNumbers = await knex.schema.hasTable("whatsapp_phone_numbers");
  if (!hasNumbers) {
    await knex.schema.createTable("whatsapp_phone_numbers", (t) => {
      t.increments("id").primary();
      t.string("phone_number_id").notNullable().unique();
      t.string("display_phone_number");
      t.string("label");
      t.boolean("is_default").notNullable().defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  const hasConvoPhone = await knex.schema.hasColumn(
    "conversations",
    "phone_number_id"
  );
  if (!hasConvoPhone) {
    await knex.schema.alterTable("conversations", (t) => {
      t.string("phone_number_id");
    });

    // Helpful index for the common lookup path.
    await knex.schema.alterTable("conversations", (t) => {
      t.index(["customer_id", "phone_number_id"], "idx_convo_customer_phone");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasConvoPhone = await knex.schema.hasColumn(
    "conversations",
    "phone_number_id"
  );
  if (hasConvoPhone) {
    await knex.schema.alterTable("conversations", (t) => {
      t.dropIndex(["customer_id", "phone_number_id"], "idx_convo_customer_phone");
      t.dropColumn("phone_number_id");
    });
  }

  const hasNumbers = await knex.schema.hasTable("whatsapp_phone_numbers");
  if (hasNumbers) {
    await knex.schema.dropTable("whatsapp_phone_numbers");
  }
}
