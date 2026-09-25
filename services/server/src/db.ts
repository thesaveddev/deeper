/**
 * Postgres connection + catalog sync.
 *
 * The game server stays fully playable without a database: if Postgres is
 * unreachable the server falls back to in-memory state and logs a warning.
 * Answer text is never written here — see persistence.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { categories, questions } from '@deeper/content';

const DEFAULT_URL = 'postgresql://deeper:deeper@localhost:5432/deeper';

/** Read DATABASE_URL from the repo-root .env when the shell has not provided it. */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (!match?.[1]) continue;
        const key = match[1];
        const value = (match[2] ?? '').replace(/^["']|["']$/g, '');
        if (key === 'DATABASE_URL' && value) return value;
        if (!(key in process.env)) process.env[key] = value;
      }
      break;
    } catch {
      // Try the next candidate location.
    }
  }
  return process.env.DATABASE_URL ?? DEFAULT_URL;
}

export const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(),
  max: 8,
  connectionTimeoutMillis: 4000,
});

let ready = false;
export const isDbReady = (): boolean => ready;

function logFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[DB] ${scope} failed: ${message}`);
}

/** Upsert the question catalog so room/game foreign keys always resolve. */
async function syncCatalog(client: pg.PoolClient): Promise<void> {
  await client.query('BEGIN');

  const categoryValues: unknown[] = [];
  const categoryTuples = categories.map((category, index) => {
    const base = index * 5;
    categoryValues.push(category.id, category.title, category.description, category.isPremium, category.isAdult);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  await client.query(
    `INSERT INTO categories (id, title, description, is_premium, is_adult)
     VALUES ${categoryTuples.join(', ')}
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           is_premium = EXCLUDED.is_premium,
           is_adult = EXCLUDED.is_adult`,
    categoryValues,
  );

  const CHUNK = 100;
  for (let offset = 0; offset < questions.length; offset += CHUNK) {
    const chunk = questions.slice(offset, offset + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((question, index) => {
      const base = index * 9;
      values.push(
        question.id,
        question.categoryId,
        question.question,
        question.difficulty,
        question.intensity,
        question.ageRating,
        question.isAdult,
        question.isPremium,
        question.isActive,
      );
      const p = (name: number) => `$${base + name}`;
      return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)})`;
    });
    await client.query(
      `INSERT INTO questions (id, category_id, question, difficulty, intensity, age_rating, is_adult, is_premium, is_active)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (id) DO UPDATE
         SET question = EXCLUDED.question,
             difficulty = EXCLUDED.difficulty,
             intensity = EXCLUDED.intensity,
             is_active = EXCLUDED.is_active`,
      values,
    );
  }

  await client.query('COMMIT');
}

/**
 * Ping Postgres and sync the catalog. Resolves false (instead of throwing)
 * when the database is unavailable so boot never fails.
 */
export async function initDb(): Promise<boolean> {
  const client = await pool.connect().catch(() => null);
  if (!client) {
    console.warn('[DB] Could not open a connection. Running with in-memory state only.');
    return false;
  }
  try {
    await client.query('SELECT 1');
    await syncCatalog(client);
    ready = true;
    console.log(`[DB] Postgres connected; synced ${categories.length} categories and ${questions.length} questions`);
  } catch (error) {
    ready = false;
    await client.query('ROLLBACK').catch(() => undefined);
    logFailure('init', error);
    console.warn('[DB] Running with in-memory state only. Run `npm --workspace infra/postgres run migrate` to set up Postgres.');
  } finally {
    client.release();
  }
  return ready;
}

export async function closeDb(): Promise<void> {
  try {
    await pool.end();
  } catch (error) {
    logFailure('close', error);
  }
}

export { logFailure };
