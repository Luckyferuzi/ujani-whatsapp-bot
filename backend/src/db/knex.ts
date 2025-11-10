import 'dotenv/config';
import knex, { Knex } from 'knex';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Recreate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migrations folder (absolute path)
const migrationsDir = path.resolve(__dirname, '../../migrations');

export const db: Knex = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 10 },
  migrations: {
    tableName: 'knex_migrations',
    directory: migrationsDir,
    extension: 'ts'
  }
});

export default db;
