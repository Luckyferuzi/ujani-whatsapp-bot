import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Main products table
  await knex.schema.createTable("products", (t) => {
    t.increments("id").primary();
    t.string("sku").notNullable().unique(); // e.g. "PROMAX"
    t.string("name").notNullable();         // e.g. "Ujani Promax"
    t.integer("price_tzs").notNullable();   // base price
    t.string("short_description").notNullable(); // 1–2 line summary
    t.text("description").notNullable();         // Kuhusu bidhaa
    t.text("usage_instructions").notNullable();  // Jinsi ya kutumia
    t.text("warnings").notNullable();            // Tahadhari muhimu
    t.boolean("is_installment").notNullable().defaultTo(false);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  // Optional: per-product discount rules
  await knex.schema.createTable("product_discounts", (t) => {
    t.increments("id").primary();
    t.integer("product_id")
      .notNullable()
      .references("products.id")
      .onDelete("CASCADE");
    t.string("name").notNullable(); // e.g. "Promo ya mwezi"
    t.enu("type", ["percentage", "fixed"]).notNullable();
    t.integer("amount").notNullable(); // 10 (10%) or 5000 (TZS)
    t.timestamp("start_at").nullable();
    t.timestamp("end_at").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("product_discounts");
  await knex.schema.dropTableIfExists("products");
}
