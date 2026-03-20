import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("chat_sessions", (t) => {
    t.string("wa_id").primary();
    t.jsonb("payload").notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    t.timestamp("expires_at").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.index(["expires_at"], "chat_sessions_expires_at_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("chat_sessions");
}
