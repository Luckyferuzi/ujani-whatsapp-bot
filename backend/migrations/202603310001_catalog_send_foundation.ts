import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasProductCatalogLinks = await knex.schema.hasTable("product_catalog_links");
  if (!hasProductCatalogLinks) {
    await knex.schema.createTable("product_catalog_links", (table) => {
      table.increments("id").primary();
      table
        .integer("product_id")
        .notNullable()
        .references("id")
        .inTable("products")
        .onDelete("CASCADE");
      table.string("sku").notNullable();
      table.string("meta_catalog_id").nullable();
      table.string("meta_retailer_id").notNullable();
      table.string("meta_product_id").nullable();
      table.string("sync_status").notNullable();
      table.timestamp("last_synced_at").nullable();
      table.text("last_error").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.unique(["product_id"], { indexName: "uq_product_catalog_links_product_id" });
      table.unique(["sku"], { indexName: "uq_product_catalog_links_sku" });
      table.index(["meta_retailer_id"], "idx_product_catalog_links_meta_retailer_id");
      table.index(["sync_status"], "idx_product_catalog_links_sync_status");
      table.index(["meta_catalog_id"], "idx_product_catalog_links_meta_catalog_id");
    });
  }

  const hasCatalogSendEvents = await knex.schema.hasTable("catalog_send_events");
  if (!hasCatalogSendEvents) {
    await knex.schema.createTable("catalog_send_events", (table) => {
      table.increments("id").primary();
      table
        .integer("conversation_id")
        .notNullable()
        .references("id")
        .inTable("conversations")
        .onDelete("CASCADE");
      table
        .integer("message_id")
        .nullable()
        .references("id")
        .inTable("messages")
        .onDelete("SET NULL");
      table
        .integer("customer_id")
        .nullable()
        .references("id")
        .inTable("customers")
        .onDelete("SET NULL");
      table.string("send_kind").notNullable();
      table
        .integer("product_id")
        .nullable()
        .references("id")
        .inTable("products")
        .onDelete("SET NULL");
      table.jsonb("product_ids_json").nullable();
      table.string("meta_catalog_id").nullable();
      table.string("meta_retailer_id").nullable();
      table.string("wa_message_id").nullable();
      table.string("send_status").notNullable();
      table.string("error_code").nullable();
      table.string("error_title").nullable();
      table.text("error_details").nullable();
      table.string("trigger_source").notNullable();
      table
        .integer("actor_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(["conversation_id"], "idx_catalog_send_events_conversation");
      table.index(["message_id"], "idx_catalog_send_events_message");
      table.index(["customer_id"], "idx_catalog_send_events_customer");
      table.index(["product_id"], "idx_catalog_send_events_product");
      table.index(["send_kind"], "idx_catalog_send_events_send_kind");
      table.index(["send_status"], "idx_catalog_send_events_send_status");
      table.index(["created_at"], "idx_catalog_send_events_created_at");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCatalogSendEvents = await knex.schema.hasTable("catalog_send_events");
  if (hasCatalogSendEvents) {
    await knex.schema.dropTable("catalog_send_events");
  }

  const hasProductCatalogLinks = await knex.schema.hasTable("product_catalog_links");
  if (hasProductCatalogLinks) {
    await knex.schema.dropTable("product_catalog_links");
  }
}
