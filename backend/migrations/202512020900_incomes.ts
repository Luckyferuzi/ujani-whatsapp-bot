import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("incomes", (table) => {
    table.increments("id").primary();

    table
      .integer("order_id")
      .references("orders.id")
      .onDelete("SET NULL");

    table
      .integer("amount_tzs")
      .notNullable()
      .comment("Income amount in TZS");

    table
      .string("status", 20)
      .notNullable()
      .defaultTo("pending")
      .comment("pending | approved | rejected");

    table
      .string("source", 50)
      .notNullable()
      .defaultTo("order")
      .comment("Source e.g. order, manual");

    table.text("description").nullable();

    table
      .timestamp("recorded_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment("When this income entry was recorded");

    table
      .timestamp("approved_at", { useTz: false })
      .nullable()
      .comment("When this income was approved");

    table
      .timestamp("rejected_at", { useTz: false })
      .nullable()
      .comment("When this income was rejected");

    table
      .timestamp("created_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: false })
      .notNullable()
      .defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incomes");
}
