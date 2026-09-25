import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { z } from 'zod';
import { GameRoom, type RoomPlayer } from './game-room.js';
import type { CategoryId, ReactionType } from '@deeper/shared';
import { getCategory } from '@deeper/content';
import { initDb, logFailure } from './db.js';
import { initLiveStore } from './live-store.js';
import { RoomRegistry } from './room-registry.js';
import {
  applyEntitlement,
  findUserByDeviceKeys,
  recordWebhookEvent,
} from './persistence.js';
import {
  REVENUECAT_ENTITLEMENT,
  candidateUserKeys,
  concernsOurEntitlement,
  effectForEvent,
  parsePayload,
  verifyBearer,
  verifySignature,
} from './revenuecat.js';
import {
  ensureUser,
  recordGameFinished,
  recordGameStarted,
  recordPlayerJoined,
  recordPlayerLeft,
  recordReaction,
  recordRoomCreated,
  recordRoomExpired,
  touchRoom,
  type StoredUser,
} from './persistence.js';

type ServerPlayer = { playerId: string; displayName: string; freeGames: number; premium: boolean; userId?: string | undefined };

const app = express(); app.use(cors()); app.get('/health', (_req, res) => res.json({ ok: true, service: 'deeper-server' }));

/**
 * RevenueCat webhook.
 *
 * `express.raw()` is essential: HMAC verification runs over the exact bytes
 * received, and letting Express parse the body first would change them and
 * reject valid deliveries.
 *
 * We answer 200 only after the event has been durably applied, and 5xx on any
 * failure so RevenueCat retries (5 attempts, 5/10/20/40/80 minutes). An unknown
 * app user is acknowledged rather than retried: retrying cannot conjure a row
 * we deliberately did not create, and a retry storm helps nobody.
 */
app.post('/webhooks/revenuecat', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || secret.length < 16) {
    console.warn('[webhook] REVENUECAT_WEBHOOK_SECRET is not set — rejecting all webhook deliveries');
    res.status(503).json({ error: 'webhook not configured' });
    return;
  }

  // HMAC is the strong option; the static header is the simpler one. Either passes.
  const hmacHeader = req.headers['x-revenuecat-webhook-signature'];
  const hmacResult = verifySignature(raw, typeof hmacHeader === 'string' ? hmacHeader : undefined, secret);
  const bearerOk = verifyBearer(
    typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
    secret,
  );
  if (!hmacResult.ok && !bearerOk) {
    console.warn(`[webhook] rejected delivery: ${hmacResult.ok ? 'hmac ok but bearer failed' : hmacResult.reason}`);
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const event = parsePayload(raw);
  if (!event) {
    res.status(400).json({ error: 'unrecognised payload' });
    return;
  }

  try {
    const firstDelivery = await recordWebhookEvent({
      provider: 'revenuecat',
      eventId: event.id,
      eventType: event.type,
      appUserId: event.app_user_id,
      environment: event.environment,
    });
    if (!firstDelivery) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }

    const effect = effectForEvent(event.type);
    if (effect === 'keep' || !concernsOurEntitlement(event)) {
      res.status(200).json({ ok: true, applied: false });
      return;
    }

    const userId = await findUserByDeviceKeys(candidateUserKeys(event));
    if (!userId) {
      // Acknowledge so RevenueCat stops retrying, but make it loud: this usually
      // means the purchase arrived for a user we no longer have a row for.
      console.warn(`[webhook] no local user for RevenueCat app_user_id=${event.app_user_id} (${event.type})`);
      res.status(200).json({ ok: true, applied: false, reason: 'unknown-user' });
      return;
    }

    await applyEntitlement({
      userId,
      provider: 'revenuecat',
      entitlementKey: REVENUECAT_ENTITLEMENT,
      active: effect === 'grant',
      expiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
      productId: event.product_id,
      transactionId: event.transaction_id,
      purchasedAt: event.purchased_at_ms ? new Date(event.purchased_at_ms) : undefined,
    });

    console.log(`[webhook] ${event.type} -> ${effect} for ${event.app_user_id}`);
    res.status(200).json({ ok: true, applied: true, effect });
  } catch (error) {
    // 5xx so RevenueCat retries. The event row is not committed on failure,
    // so the retry is processed rather than skipped as a duplicate.
    logFailure('revenuecatWebhook', error);
    res.status(500).json({ error: 'could not process' });
  }
});

const httpServer = http.createServer(app); const io = new Server(httpServer, { cors: { origin: '*' } });
const registry = new RoomRegistry(); const players = new Map<string, ServerPlayer>(); const sockets = new Map<string, { roomId: string; playerId: string }>();
const categorySchema = z.enum(['couples', 'deep', 'know-me', 'funny', 'friends', 'first-date', 'late-night', 'after-dark']);
// Premium decks (first-date, late-night, after-dark) are gated on the account's
// server-side entitlement, never on a client claim. Enforcement defaults to ON so
// a production deploy cannot accidentally ship the decks for free; set
// PREMIUM_ENFORCEMENT=off locally to test those decks before RevenueCat is wired.
const premiumEnforced = (process.env.PREMIUM_ENFORCEMENT ?? 'on').toLowerCase() !== 'off';
const nameSchema = z.string().trim().min(1).max(32);
const deviceKeySchema = z.string().trim().min(6).max(64).regex(/^[\w-]+$/);
// Player-facing copy for every error code the server can raise. Previously all
// failures surfaced as one generic string, which made a dead socket and a full
// room indistinguishable to the person holding the phone.
const ERROR_MESSAGES: Record<string, string> = {
  NOT_IN_ROOM: 'You are not in a room any more.',
  ROOM_NOT_FOUND: 'That room does not exist. Ask the host for the code again.',
  ROOM_EXPIRED: 'That game is over — the room expired or the server restarted.',
  RESUME_NOT_FOUND: 'That game is over — the room expired or the server restarted.',
  ROOM_FULL: 'That room is already full.',
  GAME_ALREADY_STARTED: 'That game has already started.',
  MIN_PLAYERS_REQUIRED: 'Wait for at least one other player to join.',
  NO_HOSTING_CREDITS: 'You are out of free games. Upgrade to DEEPER+ to keep hosting.',
  HOST_ONLY: 'Only the host can do that.',
  PREMIUM_REQUIRED: 'This deck is part of DEEPER+. Upgrade to unlock it.',
  AGE_CONFIRMATION_REQUIRED: 'You must confirm you are 18 or older for this deck.',
  PLAYER_NOT_IN_ROOM: 'You are not part of this round.',
  ANSWERS_CLOSED: 'Answers are closed for this question.',
  REVEAL_NOT_READY: 'Wait for everyone to submit an answer first.',
  REACTIONS_CLOSED: 'Reactions are closed right now.',
  NOT_READY_FOR_NEXT: 'Wait for the reveal to finish.',
  NOT_PREDICTION_MODE: 'This deck does not use predictions.',
  INVALID_ANSWER: 'That answer will not work. Try again.',
  SERVER_ERROR: 'Something went wrong. Please try again.',
};
const errorFor = (error: unknown) => { const code = error instanceof Error ? error.message : 'SERVER_ERROR'; return { code, message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.SERVER_ERROR }; };
function sendSnapshot(room: GameRoom) { for (const player of room.participants) if (player.socketId) io.to(player.socketId).emit('room:snapshot', room.snapshot()); }
function ack<T>(callback: ((result: unknown) => void) | undefined, result: unknown) { callback?.(result); }
async function context(socketId: string) { const value = sockets.get(socketId); if (!value) throw new Error('NOT_IN_ROOM'); const room = await registry.get(value.roomId); if (!room) throw new Error('ROOM_NOT_FOUND'); return { ...value, room }; }
/** Resolve (or lazily create) the durable user row for a connecting device. */
async function resolveAccount(deviceKey: string | undefined, playerId: string, displayName: string): Promise<StoredUser | null> {
  const key = deviceKey ?? playerId;
  const stored = await ensureUser(key, displayName);
  if (!stored) return null;
  return stored;
}
function registerPlayer(playerId: string, displayName: string, account: StoredUser | null): ServerPlayer {
  const identity: ServerPlayer = {
    playerId,
    displayName,
    freeGames: account?.freeGames ?? 10,
    premium: account?.premium ?? false,
    userId: account?.userId,
  };
  players.set(playerId, identity);
  return identity;
}

io.on('connection', (socket) => {
  socket.on('room:create', async (input, callback) => { try { const parsed = z.object({ categoryId: categorySchema, maxPlayers: z.number().int().min(2).max(8).optional(), displayName: nameSchema.optional(), ageConfirmed: z.boolean().optional(), deviceKey: deviceKeySchema.optional() }).parse(input); if (parsed.categoryId === 'after-dark' && !parsed.ageConfirmed) throw new Error('AGE_CONFIRMATION_REQUIRED'); const category = getCategory(parsed.categoryId as CategoryId); const maxPlayers = Math.min(parsed.maxPlayers ?? category.maxPlayers, category.maxPlayers); const playerId = randomUUID(); const displayName = parsed.displayName ?? `Player ${playerId.slice(0, 4)}`; const account = await resolveAccount(parsed.deviceKey, playerId, displayName); const identity = registerPlayer(playerId, displayName, account); if (premiumEnforced && category.isPremium && !identity.premium) throw new Error('PREMIUM_REQUIRED'); const host: RoomPlayer = { playerId, displayName, sessionId: socket.id, isHost: true, connected: true, joinedAt: new Date().toISOString(), socketId: socket.id }; const room = registry.create(parsed.categoryId as CategoryId, host, maxPlayers); sockets.set(socket.id, { roomId: room.state.roomId, playerId }); socket.join(room.state.roomId); void recordRoomCreated({ roomId: room.state.roomId, roomCode: room.state.roomCode, hostUserId: identity.userId, categoryId: room.state.categoryId }); void recordPlayerJoined({ roomId: room.state.roomId, userId: identity.userId, displayName }); ack(callback, { ok: true, data: room.snapshot(), you: playerId }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('room:join', async (input, callback) => { try { const parsed = z.object({ roomCode: z.string().trim().toUpperCase().length(4), displayName: nameSchema.optional(), deviceKey: deviceKeySchema.optional() }).parse(input); const room = await registry.getByCode(parsed.roomCode); if (!room) throw new Error('ROOM_NOT_FOUND'); const playerId = randomUUID(); const displayName = parsed.displayName ?? `Player ${playerId.slice(0, 4)}`; const account = await resolveAccount(parsed.deviceKey, playerId, displayName); const identity = registerPlayer(playerId, displayName, account); const player: RoomPlayer = { playerId, displayName, sessionId: socket.id, isHost: false, connected: true, joinedAt: new Date().toISOString(), socketId: socket.id }; room.addPlayer(player); sockets.set(socket.id, { roomId: room.state.roomId, playerId }); socket.join(room.state.roomId); void recordPlayerJoined({ roomId: room.state.roomId, userId: identity.userId, displayName }); sendSnapshot(room); ack(callback, { ok: true, data: room.snapshot(), you: playerId }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('session:resume', async (input, callback) => { try { const parsed = z.object({ roomId: z.string().trim().min(1).max(64), playerId: z.string().trim().min(1).max(64), sessionId: z.string().trim().max(64).optional(), deviceKey: deviceKeySchema.optional() }).parse(input); const room = await registry.get(parsed.roomId); if (!room) throw new Error('ROOM_EXPIRED'); const player = room.state.players.get(parsed.playerId); if (!player) throw new Error('RESUME_NOT_FOUND'); if (!players.has(parsed.playerId)) registerPlayer(parsed.playerId, player.displayName, await resolveAccount(parsed.deviceKey, parsed.playerId, player.displayName)); room.setConnection(parsed.playerId, true, socket.id); sockets.set(socket.id, { roomId: room.state.roomId, playerId: parsed.playerId }); socket.join(room.state.roomId); sendSnapshot(room); ack(callback, { ok: true, data: room.snapshot(), you: parsed.playerId }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('room:leave', async (callback) => { try { const value = sockets.get(socket.id); if (!value) throw new Error('NOT_IN_ROOM'); const room = await registry.get(value.roomId); const identity = players.get(value.playerId); if (room) { room.removePlayer(value.playerId); void recordPlayerLeft(room.state.roomId, identity?.userId); sendSnapshot(room); } sockets.delete(socket.id); ack(callback, { ok: true, data: undefined }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('room:start', async (callback) => { try { const { room, playerId } = await context(socket.id); const identity = players.get(playerId)!; const wasConsumed = room.state.consumedCredit; room.start(playerId, identity.premium || identity.freeGames > 0); const started = await recordGameStarted({ roomId: room.state.roomId, hostUserId: identity.userId, hostPremium: identity.premium, categoryId: room.state.categoryId, participantUserIds: room.participants.map((participant) => players.get(participant.playerId)?.userId), questionIds: room.state.questions.map((question) => question.id) }); if (!identity.premium && (started?.consumed ?? !wasConsumed)) identity.freeGames = Math.max(0, identity.freeGames - 1); sendSnapshot(room); io.to(room.state.roomId).emit('game:started', room.snapshot()); ack(callback, { ok: true, data: room.snapshot() }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('answer:submit', async (input, callback) => { try { const { room, playerId } = await context(socket.id); const parsed = z.object({ answer: z.string().trim().min(1).max(1000) }).parse(input); room.submit(playerId, parsed.answer); sendSnapshot(room); ack(callback, { ok: true, data: room.snapshot() }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('answer:predict', async (input, callback) => { try { const { room, playerId } = await context(socket.id); const parsed = z.object({ prediction: z.string().trim().min(1).max(1000) }).parse(input); room.predict(playerId, parsed.prediction); sendSnapshot(room); ack(callback, { ok: true, data: room.snapshot() }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('reveal:ready', async (callback) => { try { const { room, playerId } = await context(socket.id); room.readyReveal(playerId); sendSnapshot(room); if (room.state.phase === 'REVEAL') io.to(room.state.roomId).emit('reveal:start', room.snapshot()); ack(callback, { ok: true, data: room.snapshot() }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('reaction:send', async (input, callback) => { try { const { room, playerId } = await context(socket.id); const parsed = z.object({ reaction: z.enum(['love', 'funny', 'unexpected', 'more']) }).parse(input); room.sendReaction(playerId, parsed.reaction as ReactionType); const identity = players.get(playerId); void recordReaction({ roomId: room.state.roomId, userId: identity?.userId, questionNumber: room.state.questionNumber, reaction: parsed.reaction as ReactionType }); sendSnapshot(room); ack(callback, { ok: true, data: room.snapshot() }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('question:next', async (callback) => { try { const { room, playerId } = await context(socket.id); room.next(playerId); sendSnapshot(room); const event = room.state.status === 'complete' ? 'game:completed' : 'question:next'; if (room.state.status === 'complete') void recordGameFinished(room.state.roomId, 'completed'); else void touchRoom(room.state.roomId); io.to(room.state.roomId).emit(event, room.snapshot()); ack(callback, { ok: true, data: room.snapshot() }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('room:end', async (callback) => { try { const { room, playerId } = await context(socket.id); room.end(playerId); void recordGameFinished(room.state.roomId, 'host-ended'); sendSnapshot(room); io.to(room.state.roomId).emit('game:ended', room.snapshot()); ack(callback, { ok: true, data: room.snapshot() }); } catch (error) { ack(callback, { ok: false, error: errorFor(error) }); } });
  socket.on('disconnect', async () => { const value = sockets.get(socket.id); if (!value) return; const room = await registry.get(value.roomId); if (room) { room.setConnection(value.playerId, false); sendSnapshot(room); } sockets.delete(socket.id); });
});

// Room expiration cleanup — run every 5 minutes
const ROOM_TTL_MS = 120 * 60 * 1000; // 2 hours
setInterval(() => {
  const now = Date.now();
  for (const room of registry.values()) {
    if (now - room.state.lastActivityAt > ROOM_TTL_MS && room.state.status !== 'active') {
      const roomId = room.state.roomId;
      void registry.purge(room);
      void recordRoomExpired(roomId);
      // Clean up player references
      for (const [socketId, value] of sockets.entries()) {
        if (value.roomId === roomId) sockets.delete(socketId);
      }
      console.log(`[Room] Expired room ${room.state.roomCode} (${roomId})`);
    }
  }
}, 5 * 60 * 1000);

// PORT can arrive garbage-collected from the shell (e.g. PORT=0); only
// accept a valid TCP port, otherwise use the DEEPER default.
const rawPort = Number(process.env.PORT);
const port =
  Number.isInteger(rawPort) && rawPort > 0 && rawPort < 65_536 ? rawPort : 4400;
// Initialise the database BEFORE accepting connections so the first game of
// the day never races the catalog sync (falls back to in-memory if offline).
void Promise.all([initDb(), initLiveStore()]).finally(() => {
  httpServer.listen(port, () => console.log(`DEEPER server listening on :${port}`));
});
