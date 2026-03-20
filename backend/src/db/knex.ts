import 'dotenv/config';
import knex, { Knex } from 'knex';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config.js';

// Recreate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migrations folder (absolute path)
const migrationsDir = path.resolve(__dirname, '../../migrations');

function buildConnection() {
  const wantsSsl =
    /sslmode=require/i.test(env.DATABASE_URL) ||
    env.DATABASE_URL.includes("neon.tech") ||
    env.DATABASE_URL.includes("render.com");

  if (!wantsSsl) {
    return env.DATABASE_URL;
  }

  return {
    connectionString: env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    },
  };
}

export const db: Knex = knex({
  client: 'pg',
  connection: buildConnection(),
  pool: {
    min: 0,
    max: 10,
    idleTimeoutMillis: 30_000,
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: migrationsDir,
    extension: 'ts'
  }
});

export default db;
