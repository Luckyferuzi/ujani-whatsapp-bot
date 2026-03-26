import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (table) => {
    table.string("message_kind").notNullable().defaultTo("freeform");
    table.text("status_reason").nullable();
    table.string("error_code").nullable();
    table.string("error_title").nullable();
    table.text("error_details").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("messages", (table) => {
    table.dropColumn("message_kind");
    table.dropColumn("status_reason");
    table.dropColumn("error_code");
    table.dropColumn("error_title");
    table.dropColumn("error_details");
  });
}
