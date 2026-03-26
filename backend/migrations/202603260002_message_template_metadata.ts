import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (table) => {
    table.string("template_name").nullable();
    table.string("template_language").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (table) => {
    table.dropColumn("template_name");
    table.dropColumn("template_language");
  });
}
