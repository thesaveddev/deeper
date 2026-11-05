/**
 * Domain persistence for rooms, players, games and reactions.
 *
 * Every function is failure-tolerant: a database error is logged and the
 * in-memory game continues. Privacy rules:
 *   - Answer and prediction text are NEVER written here (they live only in
 *     the in-memory GameRoom and are discarded when the round advances).
 *   - Nothing here is sent to clients; these are write-only side effects.
 */

import type { CategoryId, ReactionType, RoomStatus } from '@deeper/shared';
import { isDbReady, logFailure, pool } from './db.js';

/**
 * Entitlement keys that grant premium access.
 *
 * A single list rather than one hardcoded constant, so adding a second paid
 * product is a one-line change here rather than a hunt through the webhook. A
 * user holds premium if ANY key in this list is active for them, which is what
 * stops one purchase from revoking another.
 */
export const PREMIUM_ENTITLEMENTS: readonly string[] = ['deeper_plus'];

/** The slice of a pg client that the entitlement writes need. */
export interface EntitlementClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface StoredUser {
  userId: string;
  freeGames: number;
  premium: boolean;
}

/** Rooms map to exactly one game row via credit_consumption_key. */
const creditKey = (roomId: string) => `room:${roomId}`;
const gameIdsByRoom = new Map<string, string>();

/** Find-or-create the durable user row for a device identity. */
export async function ensureUser(deviceKey: string, displayName: string): Promise<StoredUser | null> {
  if (!isDbReady()) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (device_id) VALUES ($1)
       ON CONFLICT (device_id) DO UPDATE SET updated_at = now()
       RETURNING id, free_hosted_games_remaining, premium_entitlement`,
      [deviceKey],
    );
    const user = rows[0];
    if (!user) return null;
    await pool.query(
      `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [user.id, displayName],
    );
    return {
      userId: user.id as string,
      freeGames: user.free_hosted_games_remaining as number,
      premium: user.premium_entitlement as boolean,
    };
  } catch (error) {
    logFailure('ensureUser', error);
    return null;
  }
}

export async function recordRoomCreated(params: {
  roomId: string;
  roomCode: string;
  hostUserId: string | undefined;
  categoryId: CategoryId;
}): Promise<void> {
  if (!isDbReady() || !params.hostUserId) return;
  try {
    await pool.query(
      `INSERT INTO rooms (id, room_code, host_user_id, category_id, status)
       VALUES ($1, $2, $3, $4, 'lobby')
       ON CONFLICT (id) DO UPDATE SET last_activity_at = now()`,
      [params.roomId, params.roomCode, params.hostUserId, params.categoryId],
    );
  } catch (error) {
    logFailure('recordRoomCreated', error);
  }
}

export async function recordPlayerJoined(params: {
  roomId: string;
  userId: string | undefined;
  displayName: string;
}): Promise<void> {
  if (!isDbReady() || !params.userId) return;
  try {
    await pool.query(
      `INSERT INTO room_players (room_id, user_id, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, left_at = NULL`,
      [params.roomId, params.userId, params.displayName],
    );
  } catch (error) {
    logFailure('recordPlayerJoined', error);
  }
}

export async function recordPlayerLeft(roomId: string, userId: string | undefined): Promise<void> {
  if (!isDbReady() || !userId) return;
  try {
    await pool.query(
      'UPDATE room_players SET left_at = now() WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL',
      [roomId, userId],
    );
  } catch (error) {
    logFailure('recordPlayerLeft', error);
  }
}

export async function touchRoom(roomId: string, status?: RoomStatus): Promise<void> {
  if (!isDbReady()) return;
  try {
    if (status) {
      await pool.query('UPDATE rooms SET last_activity_at = now(), status = $2 WHERE id = $1', [roomId, status]);
    } else {
      await pool.query('UPDATE rooms SET last_activity_at = now() WHERE id = $1', [roomId]);
    }
  } catch (error) {
    logFailure('touchRoom', error);
  }
}

/**
 * Record the start of a game. The unique credit_consumption_key guarantees a
 * room is charged at most once, ever — restarts and duplicate calls cannot
 * double-charge. The host's free-game allowance is decremented atomically in
 * the same transaction, and never for premium hosts.
 *
 * Returns null when the game could not be recorded (e.g. host user row missing).
 */
export async function recordGameStarted(params: {
  roomId: string;
  hostUserId: string | undefined;
  hostPremium: boolean;
  categoryId: CategoryId;
  participantUserIds: Array<string | undefined>;
  questionIds: string[];
}): Promise<{ gameId: string; consumed: boolean } | null> {
  if (!isDbReady() || !params.hostUserId) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO games (room_id, host_user_id, category_id, started_at, credit_consumption_key)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (credit_consumption_key) DO NOTHING
       RETURNING id`,
      [params.roomId, params.hostUserId, params.categoryId, creditKey(params.roomId)],
    );

    let gameId = inserted.rows[0]?.id as string | undefined;
    const consumed = Boolean(gameId);

    if (!gameId) {
      const existing = await client.query('SELECT id FROM games WHERE credit_consumption_key = $1', [
        creditKey(params.roomId),
      ]);
      gameId = existing.rows[0]?.id as string | undefined;
      if (!gameId) {
        await client.query('ROLLBACK');
        return null;
      }
    }

    for (const userId of params.participantUserIds) {
      if (!userId) continue;
      await client.query(
        'INSERT INTO game_players (game_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [gameId, userId],
      );
    }

    for (const [position, questionId] of params.questionIds.entries()) {
      await client.query(
        'INSERT INTO game_questions (game_id, question_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [gameId, questionId, position + 1],
      );
    }

    await client.query('UPDATE rooms SET status = $2, last_activity_at = now() WHERE id = $1', [
      params.roomId,
      'active',
    ]);

    if (consumed && !params.hostPremium) {
      await client.query(
        `UPDATE users
            SET free_hosted_games_remaining = GREATEST(free_hosted_games_remaining - 1, 0),
                updated_at = now()
          WHERE id = $1 AND premium_entitlement = false`,
        [params.hostUserId],
      );
    }

    await client.query('COMMIT');
    gameIdsByRoom.set(params.roomId, gameId);
    return { gameId, consumed };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    logFailure('recordGameStarted', error);
    return null;
  } finally {
    client.release();
  }
}

export async function recordGameFinished(
  roomId: string,
  reason: 'completed' | 'host-ended' | 'player-left' | 'expired',
): Promise<void> {
  if (!isDbReady()) return;
  try {
    await pool.query(
      `UPDATE games
          SET ended_at = coalesce(ended_at, now()),
              end_reason = coalesce(end_reason, $2)
        WHERE room_id = $1`,
      [roomId, reason],
    );
    const status = reason === 'completed' ? 'complete' : reason === 'expired' ? 'expired' : 'ended';
    await pool.query('UPDATE rooms SET status = $2, last_activity_at = now() WHERE id = $1', [roomId, status]);
  } catch (error) {
    logFailure('recordGameFinished', error);
  }
}

/** Reactions are non-sensitive metadata; answer text still never persists. */
export async function recordReaction(params: {
  roomId: string;
  userId: string | undefined;
  questionNumber: number;
  reaction: ReactionType;
}): Promise<void> {
  if (!isDbReady() || !params.userId) return;
  const gameId = gameIdsByRoom.get(params.roomId);
  if (!gameId) return;
  try {
    await pool.query(
      'INSERT INTO reactions (game_id, question_position, user_id, reaction) VALUES ($1, $2, $3, $4)',
      [gameId, params.questionNumber, params.userId, params.reaction],
    );
  } catch (error) {
    logFailure('recordReaction', error);
  }
}

/* ------------------------------------------------------------------ *
 * RevenueCat entitlements
 *
 * Unlike everything above, these must NOT swallow failures. A dropped write
 * here means a paying customer is denied (or wrongly granted) access, and the
 * webhook needs to answer 5xx so RevenueCat retries the delivery. Losing a
 * reaction row is not worth a retry storm; losing an entitlement is.
 * ------------------------------------------------------------------ */

export interface WebhookEventRecord {
  provider: string;
  eventId: string;
  eventType: string;
  appUserId: string | undefined;
  environment: string | undefined;
}

/**
 * Record a delivery. Returns false when this exact event was already handled,
 * which is how duplicate deliveries are made idempotent — RevenueCat retries
 * reuse the same event id.
 */
export async function recordWebhookEvent(record: WebhookEventRecord): Promise<boolean> {
  if (!isDbReady()) throw new Error('DB_UNAVAILABLE');
  const { rows } = await pool.query(
    `INSERT INTO webhook_events (provider, event_id, event_type, app_user_id, environment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [record.provider, record.eventId, record.eventType, record.appUserId ?? null, record.environment ?? null],
  );
  return rows.length > 0;
}

/**
 * Resolve the app user to one of our rows.
 *
 * The client identifies itself to RevenueCat with the same device key the
 * server uses, so `app_user_id` maps onto `users.device_id`. The docs also ask
 * us to try `original_app_user_id` and every alias, since a user may have been
 * re-identified since their first purchase.
 */
export async function findUserByDeviceKeys(keys: string[]): Promise<string | null> {
  if (!isDbReady() || keys.length === 0) return null;
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE device_id = ANY($1::text[]) LIMIT 1',
    [keys],
  );
  return (rows[0]?.id as string | undefined) ?? null;
}

/**
 * Apply an entitlement decision. The whole thing is one transaction so the
 * `entitlements` row and the denormalised `users.premium_entitlement` flag can
 * never disagree — a guest reading a stale flag would hit a locked deck.
 */
export interface EntitlementParams {
  userId: string;
  provider: string;
  entitlementKey: string;
  active: boolean;
  expiresAt: Date | null;
  productId?: string | undefined;
  transactionId?: string | undefined;
  purchasedAt?: Date | undefined;
}

/**
 * Entitlement writes, behind a client seam so the SQL can be tested without a
 * database. The premium recomputation is the part worth testing: it is the
 * difference between "this user holds anything paid" and "this user holds the
 * thing that just arrived", and getting it wrong silently revokes a
 * subscription somebody has already paid for.
 */
export async function applyEntitlementWith(client: EntitlementClient, params: EntitlementParams): Promise<void> {
  await client.query('BEGIN');
    await client.query(
      `INSERT INTO entitlements (user_id, provider, entitlement_key, active, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, provider, entitlement_key)
       DO UPDATE SET active = EXCLUDED.active,
                     expires_at = EXCLUDED.expires_at,
                     updated_at = now()`,
      [params.userId, params.provider, params.entitlementKey, params.active, params.expiresAt],
    );

    if (params.transactionId) {
      // ON CONFLICT DO NOTHING: a retried webhook must not duplicate the sale.
      await client.query(
        `INSERT INTO purchases (user_id, provider, product_id, transaction_id, purchased_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [
          params.userId,
          params.provider,
          params.productId ?? 'unknown',
          params.transactionId,
          params.purchasedAt ?? new Date(),
        ],
      );
    }

    await client.query(
      `UPDATE users
          SET premium_entitlement = EXISTS (
                SELECT 1 FROM entitlements e
                 WHERE e.user_id = $1
                   AND e.active = true
                   AND e.entitlement_key = ANY($2::text[])
              ),
              updated_at = now()
        WHERE id = $1`,
      // Any active premium entitlement, not the one that just arrived. The
      // previous version compared against $2 = the incoming key, so a user who
      // held deeper_plus and then bought a second product had their premium flag
      // recomputed from that second product alone, silently revoking the
      // subscription they had already paid for. The flag means "holds anything
      // paid", so revoking one of several entitlements must not clear it.
      [params.userId, PREMIUM_ENTITLEMENTS],
    );
    await client.query('COMMIT');
}

/** Pool-backed entry point. Throws when the database is not ready. */
export async function applyEntitlement(params: EntitlementParams): Promise<void> {
  if (!isDbReady()) throw new Error('DB_UNAVAILABLE');
  const client = await pool.connect();
  try {
    await applyEntitlementWith(client, params);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Question ids used by the most recent `games` games of a deck.
 *
 * Read from games + game_questions, which already record what was played. Used
 * by the no-repeat window so a deck does not serve the same ten questions twice
 * in a row. Returns an empty set when the database is unavailable, which the
 * caller treats as "draw without exclusions".
 */
export async function recentlyPlayedQuestionIds(categoryId: CategoryId, games: number): Promise<string[]> {
  if (!isDbReady()) return [];
  const result = await pool.query(
    `SELECT DISTINCT gq.question_id
       FROM game_questions gq
       JOIN games g ON g.id = gq.game_id
      WHERE g.category_id = $1
        AND g.id IN (
          SELECT id FROM games
           WHERE category_id = $1
           ORDER BY started_at DESC NULLS LAST, id DESC
           LIMIT $2
        )`,
    [categoryId, games],
  );
  return result.rows.map((row) => String((row as { question_id: string }).question_id));
}

/** Called when the room-expiry sweep removes a room from memory. */
export async function recordRoomExpired(roomId: string): Promise<void> {  if (!isDbReady()) return;
  try {
    await recordGameFinished(roomId, 'expired');
    await pool.query('UPDATE rooms SET status = $2 WHERE id = $1', [roomId, 'expired']);
    gameIdsByRoom.delete(roomId);
  } catch (error) {
    logFailure('recordRoomExpired', error);
  }
}
