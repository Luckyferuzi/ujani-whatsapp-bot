import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("app_settings", (t) => {
    t.string("key").primary();
    t.jsonb("value").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  // Seed default WhatsApp Presence settings (workspace-level)
  await knex("app_settings")
    .insert({
      key: "whatsapp_presence",
      value: {
        // Used in bot/menu headers (what customers see in messages)
        brand_name: null,
        menu_intro: null,
        menu_footer: null,
        catalog_button_text: null,

        // WhatsApp Business Profile fields (can be applied to WA via Graph API)
        about: null,
        description: null,
        address: null,
        email: null,
        websites: [],
        profile_picture_url: null,
        vertical: null,
      },
    })
    .onConflict("key")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("app_settings");
}
