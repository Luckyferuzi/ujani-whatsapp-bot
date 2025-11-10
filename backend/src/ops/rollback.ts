import db from '../db/knex';

(async () => {
  try {
    const [batch, files] = await db.migrate.rollback(undefined, true);
    console.log(`Rollback done (batch ${batch}):`, files);
    process.exit(0);
  } catch (err) {
    console.error('Rollback error:', err);
    process.exit(1);
  }
})();
