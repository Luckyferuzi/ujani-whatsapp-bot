import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("expenses", (table) => {
    table.increments("id").primary();
    table
      .date("incurred_on")
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment("Date the expense was incurred");

    table
      .string("category", 50)
      .notNullable()
      .defaultTo("other")
      .comment("Category e.g. rider, rent, salary, marketing, other");

    table
      .integer("amount_tzs")
      .notNullable()
      .comment("Amount of the expense in Tanzanian shillings");

    table.text("description").nullable();

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
  await knex.schema.dropTableIfExists("expenses");
}
