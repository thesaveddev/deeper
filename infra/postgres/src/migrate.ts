import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://deeper:deeper@localhost:5432/deeper';

async function migrate() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Find SQL files
    const sqlDir = path.resolve(import.meta.dirname ?? '.', '..');
    const files = fs.readdirSync(sqlDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // Get applied migrations
    const { rows: applied } = await client.query('SELECT filename FROM _migrations ORDER BY id');
    const appliedSet = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  Skipping (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
      console.log(`  Applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  Done: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  Failed: ${file}`, err);
        throw err;
      }
    }

    console.log('\nMigrations complete.');
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
