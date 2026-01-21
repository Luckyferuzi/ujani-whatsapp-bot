import type { Knex } from "knex";

/**
 * Add first-class profile fields to users.
 *
 * All fields are nullable to keep this migration safe for existing installs.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.string("full_name", 120).nullable();
    table.string("phone", 40).nullable();
    table.string("business_name", 160).nullable();
    table.string("avatar_url", 500).nullable();
    table.text("bio").nullable();

    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  // Backfill updated_at for existing rows (best-effort)
  await knex("users").update({ updated_at: knex.fn.now() });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("bio");
    table.dropColumn("avatar_url");
    table.dropColumn("business_name");
    table.dropColumn("phone");
    table.dropColumn("full_name");
    table.dropColumn("updated_at");
  });
}
