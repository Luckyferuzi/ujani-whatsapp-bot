import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (t) => {
    // Swahili is already in short_description / description
    // These are the English versions.
    t.text("short_description_en").nullable();
    t.text("description_en").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (t) => {
    t.dropColumn("short_description_en");
    t.dropColumn("description_en");
  });
}
