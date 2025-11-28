import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (table) => {
    table
      .integer("stock_qty")
      .notNullable()
      .defaultTo(0)
      .comment("Number of units currently in stock");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (table) => {
    table.dropColumn("stock_qty");
  });
}
