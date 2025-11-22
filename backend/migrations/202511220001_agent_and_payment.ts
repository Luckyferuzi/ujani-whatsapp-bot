import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1) Track how much has been paid (aggregated) for an order
  await knex.schema.alterTable("payments", (table) => {
    table.integer("amount_tzs").nullable();
  });

  // 2) Store the delivery agent / rider phone on the order itself
  await knex.schema.alterTable("orders", (table) => {
    table.string("delivery_agent_phone").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("payments", (table) => {
    table.dropColumn("amount_tzs");
  });

  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("delivery_agent_phone");
  });
}
