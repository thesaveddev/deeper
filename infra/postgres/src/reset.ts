import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://deeper:deeper@localhost:5432/deeper';

async function reset() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log('Dropping all tables...');
    await client.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemame = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);

    console.log('Dropping migrations table...');
    await client.query('DROP TABLE IF EXISTS _migrations CASCADE');

    console.log('\nDatabase reset complete.');
  } finally {
    await client.end();
  }
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
