import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("media_files", (table) => {
    table.bigIncrements("id").primary();

    // public-safe random token (URL uses this, not the numeric ID)
    table.string("token", 80).notNullable().unique();

    table
      .integer("created_by_user_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table.string("purpose", 40).notNullable().defaultTo("generic");
    table.string("file_name", 255).nullable();
    table.string("mime_type", 120).notNullable();
    table.integer("size_bytes").notNullable();
    table.string("sha256", 64).notNullable();

    // actual bytes in DB (Postgres bytea)
    table.specificType("data", "bytea").notNullable();

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("media_files");
}
