/**
 * Retention / right-to-erasure job.
 *
 * The privacy policy promises a bounded retention period for gameplay history.
 * This is the code that keeps that promise, so it is deliberately conservative:
 *
 *   - Deletes: rooms, room_players, games, game_players, game_questions, reactions
 *     (the "which questions, which reactions, when" history), and old webhook
 *     delivery records.
 *   - Never deletes: users, profiles, entitlements, purchases. Those are the
 *     account identity and the billing record; a retention sweep has no business
 *     destroying a user's entitlement or orphaning a tax record. A real erasure
 *     request for those is explicit, not incidental.
 *   - Answer text is not here because it is not in the database. There is no
 *     answers table. See persistence.ts.
 *
 * A sweep is failure-tolerant in the same way the rest of persistence is: a
 * failed purge logs a warning and the game keeps running. It is housekeeping, not
 * a correctness dependency.
 */

import { isDbReady, logFailure, pool } from './db.js';

/** Gameplay history (rooms/games/reactions). */
const DEFAULT_GAMEPLAY_DAYS = 90;
/** Webhook delivery log. Kept longer: it is the idempotency and audit trail. */
const DEFAULT_WEBHOOK_DAYS = 365;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Guard rails. A misconfigured deploy must not be able to delete live rows. */
const MIN_DAYS = 1;
const MAX_DAYS = 3650;

export interface RetentionWindows {
  gameplayDays: number;
  webhookDays: number;
  intervalMs: number;
}

export interface RetentionReport {
  gamesDeleted: number;
  roomsDeleted: number;
  webhookEventsDeleted: number;
  dryRun: boolean;
}

function readDays(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const whole = Math.floor(value);
  // 0 and negatives are the dangerous inputs: they would purge everything that
  // has ever been written. Reject them and fall back rather than trusting them.
  if (whole < MIN_DAYS || whole > MAX_DAYS) return fallback;
  return whole;
}

/**
 * Resolve the retention windows from the environment, once.
 *
 * Note this reads process.env directly rather than via initDb()'s .env loader.
 * The job is started after initDb() in index.ts, so .env is already populated by
 * the time this is called.
 */
export function resolveRetentionWindows(
  env: NodeJS.ProcessEnv = process.env,
): RetentionWindows {
  const rawInterval = Number(env.RETENTION_PURGE_INTERVAL_MS);
  return {
    gameplayDays: readDays(env.RETENTION_DAYS_GAMEPLAY, DEFAULT_GAMEPLAY_DAYS),
    webhookDays: readDays(env.RETENTION_DAYS_WEBHOOKS, DEFAULT_WEBHOOK_DAYS),
    intervalMs:
      Number.isFinite(rawInterval) && rawInterval >= 60_000
        ? rawInterval
        : DEFAULT_INTERVAL_MS,
  };
}

/** `make_interval(days => $1)` keeps the bound a parameter, not string-built SQL. */
const GAMEPLAY_INTERVAL = 'make_interval(days => $1)';

/** Anything that can run a query: a Pool or a PoolClient. Lets tests inject. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

const countOf = (result: { rows: Record<string, unknown>[] }): number => {
  const value = result.rows[0]?.['n'];
  return typeof value === 'number' ? value : Number(value ?? 0);
};

/**
 * The actual sweep, against any caller-supplied connection.
 *
 * Order matters: `games.room_id` references `rooms(id)` without ON DELETE
 * CASCADE, so games must go first. Everything under a game or a room
 * (reactions, game_players, game_questions, room_players) cascades from those two
 * deletes, so there is nothing else to name.
 *
 * The caller owns the transaction. Splitting it out like this is what lets the
 * smoke test drive a real purge without booting a second server.
 */
export async function runRetentionPurge(
  client: Queryable,
  windows: RetentionWindows = resolveRetentionWindows(),
  dryRun = false,
): Promise<RetentionReport> {
  const report: RetentionReport = {
    gamesDeleted: 0,
    roomsDeleted: 0,
    webhookEventsDeleted: 0,
    dryRun,
  };

  await client.query('BEGIN');
  try {
    if (dryRun) {
      const games = await client.query(
        `SELECT count(*)::int AS n FROM games
         WHERE COALESCE(ended_at, started_at, now()) < now() - ${GAMEPLAY_INTERVAL}`,
        [windows.gameplayDays],
      );
      const rooms = await client.query(
        `SELECT count(*)::int AS n FROM rooms
         WHERE COALESCE(last_activity_at, created_at) < now() - ${GAMEPLAY_INTERVAL}`,
        [windows.gameplayDays],
      );
      const hooks = await client.query(
        `SELECT count(*)::int AS n FROM webhook_events
         WHERE received_at < now() - ${GAMEPLAY_INTERVAL}`,
        [windows.webhookDays],
      );
      report.gamesDeleted = countOf(games);
      report.roomsDeleted = countOf(rooms);
      report.webhookEventsDeleted = countOf(hooks);
      await client.query('ROLLBACK');
      return report;
    }

    const games = await client.query(
      `DELETE FROM games
       WHERE COALESCE(ended_at, started_at, now()) < now() - ${GAMEPLAY_INTERVAL}`,
      [windows.gameplayDays],
    );
    const rooms = await client.query(
      `DELETE FROM rooms
       WHERE COALESCE(last_activity_at, created_at) < now() - ${GAMEPLAY_INTERVAL}`,
      [windows.gameplayDays],
    );
    const hooks = await client.query(
      `DELETE FROM webhook_events
       WHERE received_at < now() - ${GAMEPLAY_INTERVAL}`,
      [windows.webhookDays],
    );
    await client.query('COMMIT');

    report.gamesDeleted = games.rowCount ?? 0;
    report.roomsDeleted = rooms.rowCount ?? 0;
    report.webhookEventsDeleted = hooks.rowCount ?? 0;
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * Delete expired gameplay and webhook history using the server's own pool.
 *
 * Failure-tolerant like the rest of persistence: a failed purge logs a warning
 * and the game keeps running. It is housekeeping, not a correctness dependency.
 */
export async function purgeExpiredRetention(
  windows: RetentionWindows = resolveRetentionWindows(),
  options: { dryRun?: boolean } = {},
): Promise<RetentionReport> {
  const dryRun = options.dryRun ?? false;
  const empty: RetentionReport = {
    gamesDeleted: 0,
    roomsDeleted: 0,
    webhookEventsDeleted: 0,
    dryRun,
  };
  if (!isDbReady()) return empty;

  const client = await pool.connect().catch(() => null);
  if (!client) return empty;

  try {
    const report = await runRetentionPurge(client, windows, dryRun);
    if (!dryRun && (report.gamesDeleted || report.roomsDeleted || report.webhookEventsDeleted)) {
      console.log(
        `[retention] purged ${report.gamesDeleted} games, ` +
          `${report.roomsDeleted} rooms, ${report.webhookEventsDeleted} webhook events ` +
          `(gameplay > ${windows.gameplayDays}d, webhooks > ${windows.webhookDays}d)`,
      );
    }
    return report;
  } catch (error) {
    logFailure('retention purge', error);
    return empty;
  } finally {
    client.release();
  }
}

/**
 * Run a purge now and then on an interval.
 *
 * The timer is unref'd so a test or a script can import this module without the
 * interval holding the process open.
 */
export function startRetentionJob(
  windows: RetentionWindows = resolveRetentionWindows(),
): () => void {
  void purgeExpiredRetention(windows);
  const timer = setInterval(() => {
    void purgeExpiredRetention(windows);
  }, windows.intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

if (process.argv.includes('--purge')) {
  const dryRun = !process.argv.includes('--force');
  void initDbAndPurge(dryRun);
}

async function initDbAndPurge(dryRun: boolean): Promise<void> {
  const { initDb, closeDb } = await import('./db.js');
  const ready = await initDb();
  if (!ready) {
    console.error('[retention] database unreachable — nothing purged');
    process.exitCode = 1;
    return;
  }
  const report = await purgeExpiredRetention(resolveRetentionWindows(), { dryRun });
  console.log(
    dryRun
      ? `[retention] dry run — would delete ${report.gamesDeleted} games, ` +
          `${report.roomsDeleted} rooms, ${report.webhookEventsDeleted} webhook events. ` +
          `Re-run with --force to apply.`
      : `[retention] deleted ${report.gamesDeleted} games, ${report.roomsDeleted} rooms, ` +
          `${report.webhookEventsDeleted} webhook events.`,
  );
  await closeDb();
}
