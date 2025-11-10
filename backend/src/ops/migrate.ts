import db from '../db/knex';

(async () => {
  try {
    const [batch, files] = await db.migrate.latest();
    console.log(`Migrations applied (batch ${batch}):`, files);
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
})();
