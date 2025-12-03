import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("orders", (table) => {
    table
      .string("payment_mode", 20)
      .notNullable()
      .defaultTo("prepay")
      .comment("prepay | cod");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("payment_mode");
  });
}
