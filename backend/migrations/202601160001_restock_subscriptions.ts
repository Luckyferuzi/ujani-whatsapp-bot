import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("restock_subscriptions", (table) => {
    table.increments("id").primary();

    table
      .integer("customer_id")
      .notNullable()
      .references("id")
      .inTable("customers")
      .onDelete("CASCADE");

    table
      .integer("product_id")
      .notNullable()
      .references("id")
      .inTable("products")
      .onDelete("CASCADE");

    // subscribed | declined | unsubscribed | notified
    table.string("status", 20).notNullable().defaultTo("subscribed");

    // Persist the language at the moment the user opted in/out.
    table.string("lang", 5).nullable();

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["customer_id", "product_id"]);
  });

  await knex.schema.alterTable("restock_subscriptions", (table) => {
    table.index(
      ["product_id", "status"],
      "restock_subscriptions_product_status_idx"
    );
    table.index(["customer_id"], "restock_subscriptions_customer_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("restock_subscriptions");
}
