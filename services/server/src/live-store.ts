/**
 * Live room state in Redis.
 *
 * The authoritative game state machine still lives in `GameRoom`. This module
 * mirrors it to Redis on every mutation so a deploy, crash or `tsc --watch`
 * restart no longer destroys games that are in progress. On a cache miss the
 * server rehydrates the room and players carry on exactly where they left off.
 *
 * Two deliberate rules:
 *
 *  1. Answers ARE persisted here — otherwise a restart would wipe the reveal and
 *     the round could never be recovered. They are encrypted with AES-256-GCM,
 *     live only as long as the room (TTL), and deleted the instant the game
 *     ends. They are never written to Postgres, never logged and never
 *     analysed. Set LIVE_STATE_SECRET before deploying.
 *  2. Redis is OPTIONAL. With no reachable server the game runs exactly as
 *     before, in memory only — it just won't survive a restart. This mirrors
 *     the existing Postgres fallback in `db.ts`.
 *
 * If no LIVE_STATE_SECRET is configured we refuse to write answers rather than
 * storing them in the clear. The room still survives; only the in-flight round
 * is lost, which is the safe failure direction.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';
import type { CategoryId, GameMode, GamePhase, ReactionType, RoomStatus } from '@deeper/shared';
import type { RoomPlayer, RoomState } from './game-room.js';

const DEFAULT_URL = 'redis://localhost:6379';
const KEY_PREFIX = 'deeper';
/** Rooms are worthless long after they end; keep the blast radius small. */
const ROOM_TTL_SECONDS = 2 * 60 * 60;

let client: RedisClientType | null = null;
let connected = false;
let encryptionKey: Buffer | null = null;
let warnedNoSecret = false;

export interface SerializedRoom {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  categoryId: CategoryId;
  maxPlayers: number;
  status: RoomStatus;
  phase: GamePhase | null;
  questionNumber: number;
  gameMode: GameMode;
  consumedCredit: boolean;
  lastActivityAt: number;
  endedReason?: RoomSnapshotEndedReason;
  players: RoomPlayer[];
  questions: RoomState['questions'];
  revealed: string[];
  reactions: Array<[string, ReactionType]>;
  scores: Array<[string, number]>;
  /** Encrypted blobs; absent when no secret is configured. */
  answers?: Record<string, string>;
  predictions?: Record<string, string>;
}

type RoomSnapshotEndedReason = NonNullable<RoomState['endedReason']>;

/* ------------------------------------------------------------------ *
 * Answer encryption
 * ------------------------------------------------------------------ */

function loadKey(): Buffer | null {
  if (encryptionKey) return encryptionKey;
  const secret = process.env.LIVE_STATE_SECRET;
  if (!secret || secret.length < 16) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn(
        '[live-store] LIVE_STATE_SECRET is not set (or too short). ' +
          'Rooms will still survive a restart, but in-flight answers will NOT be persisted.',
      );
    }
    return null;
  }
  encryptionKey = scryptSync(secret, 'deeper.live.v1', 32);
  return encryptionKey;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decrypt(blob: string, key: Buffer): string | null {
  try {
    const raw = Buffer.from(blob, 'base64');
    if (raw.length < 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const payload = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key or corrupted blob. Losing one answer is better than crashing
    // the whole room rehydration.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Connection
 * ------------------------------------------------------------------ */

export async function initLiveStore(): Promise<void> {
  // The key is resolved lazily, not here: `initDb` populates process.env from
  // the repo-root .env, and these two run concurrently. Reading it eagerly would
  // race that and silently fall back to "no encryption" in local dev.
  const url = process.env.REDIS_URL || DEFAULT_URL;

  // Probe with retries DISABLED. With a reconnect strategy in place, a refused
  // connection is retried forever and connect() never settles — which meant a
  // missing Redis delayed startup for seconds and starved callers (notably the
  // smoke test) of their health-check budget. Retries are switched on only
  // after a successful connect, so long-lived reconnects still work.
  const candidate = createClient({
    url,
    socket: { connectTimeout: 1500, reconnectStrategy: () => false },
  });
  // Without a listener, a background reconnect error would take the process
  // down. Live state is best-effort and must never be fatal.
  candidate.on('error', () => undefined);

  // Backstop for a host that accepts the socket but never answers.
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      candidate.connect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('connect timeout')), 2000);
        timer.unref?.();
      }),
    ]);
    // Now that we have a live connection, restore retry behaviour for drops.
    if (candidate.options?.socket) {
      candidate.options.socket.reconnectStrategy = (retries: number) => Math.min(retries * 200, 3000);
    }
    client = candidate;
    connected = true;
    console.log(`[live-store] connected to ${url} — live games survive restarts`);
  } catch {
    // Do NOT await this: tearing down a half-open client can block, and a
    // missing cache must never delay or hang startup. destroy() also throws
    // synchronously when the socket already closed, hence the try/catch.
    try {
      void candidate.destroy();
    } catch {
      // already closed
    }
    client = null;
    connected = false;
    console.warn(`[live-store] no Redis at ${url} — running in-memory only (games will not survive a restart)`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function liveStoreEnabled(): boolean {
  return connected && client !== null;
}

export async function closeLiveStore(): Promise<void> {
  if (client) await client.quit().catch(() => undefined);
  client = null;
  connected = false;
}

/* ------------------------------------------------------------------ *
 * Serialisation
 * ------------------------------------------------------------------ */

export function serializeRoom(state: RoomState, key: Buffer | null): SerializedRoom {
  const encryptedAnswers: Record<string, string> = {};
  if (key) {
    for (const [playerId, answer] of state.answers) encryptedAnswers[playerId] = encrypt(answer, key);
  }
  const encryptedPredictions: Record<string, string> = {};
  if (key) {
    for (const [playerId, prediction] of state.predictions) {
      encryptedPredictions[playerId] = encrypt(prediction, key);
    }
  }

  return {
    roomId: state.roomId,
    roomCode: state.roomCode,
    hostPlayerId: state.hostPlayerId,
    categoryId: state.categoryId,
    maxPlayers: state.maxPlayers,
    status: state.status,
    phase: state.phase,
    questionNumber: state.questionNumber,
    gameMode: state.gameMode,
    consumedCredit: state.consumedCredit,
    lastActivityAt: state.lastActivityAt,
    ...(state.endedReason ? { endedReason: state.endedReason } : {}),
    players: [...state.players.values()],
    questions: state.questions,
    revealed: [...state.revealed],
    reactions: [...state.reactions.entries()],
    scores: [...state.scores.entries()],
    ...(key ? { answers: encryptedAnswers, predictions: encryptedPredictions } : {}),
  };
}

export function deserializeRoom(payload: SerializedRoom, key: Buffer | null): RoomState {
  const answers = new Map<string, string>();
  const predictions = new Map<string, string>();
  if (key) {
    for (const [playerId, blob] of Object.entries(payload.answers ?? {})) {
      const plain = decrypt(blob, key);
      if (plain !== null) answers.set(playerId, plain);
    }
    for (const [playerId, blob] of Object.entries(payload.predictions ?? {})) {
      const plain = decrypt(blob, key);
      if (plain !== null) predictions.set(playerId, plain);
    }
  }

  return {
    roomId: payload.roomId,
    roomCode: payload.roomCode,
    hostPlayerId: payload.hostPlayerId,
    categoryId: payload.categoryId,
    maxPlayers: payload.maxPlayers,
    status: payload.status,
    phase: payload.phase,
    questionNumber: payload.questionNumber,
    gameMode: payload.gameMode,
    consumedCredit: payload.consumedCredit,
    lastActivityAt: payload.lastActivityAt,
    ...(payload.endedReason ? { endedReason: payload.endedReason } : {}),
    // A restored player is by definition not on a live socket yet, and the
    // socketId we stored belonged to a process that no longer exists. Drop it
    // so we never emit snapshots into the void; `session:resume` re-attaches.
    players: new Map(payload.players.map((player) => [player.playerId, { ...player, connected: false, socketId: undefined }])),
    questions: payload.questions,
    answers,
    predictions,
    revealed: new Set(payload.revealed),
    reactions: new Map(payload.reactions),
    scores: new Map(payload.scores),
  };
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

const roomKey = (roomId: string) => `${KEY_PREFIX}:room:${roomId}`;
const codeKey = (code: string) => `${KEY_PREFIX}:code:${code}`;

export async function persistRoom(state: RoomState): Promise<void> {
  if (!client || !connected) return;
  try {
    const payload = JSON.stringify(serializeRoom(state, loadKey()));
    // MULTI so the room and its code index can never disagree.
    await client.multi().set(roomKey(state.roomId), payload, { EX: ROOM_TTL_SECONDS })
      .set(codeKey(state.roomCode), state.roomId, { EX: ROOM_TTL_SECONDS })
      .exec();
  } catch (error) {
    console.warn('[live-store] persist failed:', error instanceof Error ? error.message : error);
  }
}

export async function restoreRoom(roomId: string): Promise<RoomState | null> {
  if (!client || !connected) return null;
  try {
    const raw = await client.get(roomKey(roomId));
    if (!raw) return null;
    return deserializeRoom(JSON.parse(raw) as SerializedRoom, loadKey());
  } catch (error) {
    console.warn('[live-store] restore failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function findRoomIdByCode(roomCode: string): Promise<string | null> {
  if (!client || !connected) return null;
  try {
    return await client.get(codeKey(roomCode));
  } catch {
    return null;
  }
}

/** Called the moment a game ends so answer ciphertext stops existing at all. */
export async function forgetRoom(state: Pick<RoomState, 'roomId' | 'roomCode'>): Promise<void> {
  if (!client || !connected) return;
  try {
    await client.del([roomKey(state.roomId), codeKey(state.roomCode)]);
  } catch (error) {
    console.warn('[live-store] forget failed:', error instanceof Error ? error.message : error);
  }
}

/** Test seam: lets unit tests exercise the crypto and codec without a server. */
export const __testing = { encrypt, decrypt, serializeRoom, deserializeRoom };
