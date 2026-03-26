import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (table) => {
    table.string("template_key").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (table) => {
    table.dropColumn("template_key");
  });
}
