import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (t) => {
    t.increments("id").primary();
    t.string("email").notNullable().unique();
    t.string("password_hash").notNullable();
    t.enu("role", ["admin", "staff"]).notNullable().defaultTo("staff");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("sessions", (t) => {
    t.string("token").primary();
    t.integer("user_id").references("users.id").onDelete("CASCADE");
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("expires_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sessions");
  await knex.schema.dropTableIfExists("users");
}
