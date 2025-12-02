import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("order_items", (table) => {
    table
      .integer("product_id")
      .nullable()
      .references("id")
      .inTable("products")
      .onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("order_items", (table) => {
    table.dropColumn("product_id");
  });
}
