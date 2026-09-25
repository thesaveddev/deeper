/**
 * Two-client end-to-end smoke test against a live server + Postgres.
 *
 * Boots an isolated server instance, plays a full host/guest round over
 * Socket.IO, asserts answer privacy and reveal synchronisation, then verifies
 * the persisted rows (and that no answers table exists at all).
 *
 * Run: npm --workspace @deeper/server run smoke
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import pg from 'pg';

const PORT = Number(process.env.SMOKE_PORT ?? 4100);
const BASE_URL = `http://localhost:${PORT}`;
const HOST_DEVICE = 'smoke-host-device-0001';
const GUEST_DEVICE = 'smoke-guest-device-0002';
const WEBHOOK_SECRET = 'smoke-revenuecat-webhook-secret-value';
/** Webhook event ids are globally unique by design, so make them unique per run. */
const RUN_ID = Date.now();

type Snapshot = Record<string, unknown> & {
  status?: string;
  phase?: string;
  questionNumber?: number;
  currentQuestion?: { id: string } | null;
  submittedPlayerIds?: string[];
  revealedAnswers?: Array<{ playerId: string; displayName: string; answer: string }> | undefined;
  players?: unknown[];
  endedReason?: string;
};

type Ack<T> = { ok: true; data: T; you?: string } | { ok: false; error: { code: string; message: string } };

let failures = 0;
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function emit<T>(socket: Socket, event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5000);
    const done = (result: Ack<T>) => {
      clearTimeout(timer);
      resolve(result);
    };
    if (payload === undefined) socket.emit(event, done);
    else socket.emit(event, payload, done);
  });
}

/** Latest snapshot seen per socket, updated by pushed server events. */
const latest = new Map<Socket, Snapshot>();
const track = (socket: Socket): Socket => {
  const update = (snapshot: Snapshot) => latest.set(socket, snapshot);
  socket.on('room:snapshot', update);
  socket.on('game:started', update);
  socket.on('question:next', update);
  socket.on('reveal:start', update);
  socket.on('game:ended', update);
  socket.on('game:completed', update);
  return socket;
};

async function waitSnapshot(socket: Socket, label: string, predicate: (snapshot: Snapshot) => boolean): Promise<Snapshot> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const snapshot = latest.get(socket);
    if (snapshot && predicate(snapshot)) return snapshot;
    await sleep(50);
  }
  throw new Error(`timeout waiting for snapshot: ${label}`);
}

/**
 * Refuse to run if something is already serving on the port.
 *
 * Without this, a stale server answers the health check, the freshly spawned one
 * fails to bind, and the entire suite quietly validates the WRONG build — which
 * is exactly what happened once and cost an afternoon of confusion.
 */
async function assertPortFree(port: number): Promise<void> {
  let occupied = false;
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    occupied = response.ok;
  } catch {
    occupied = false; // nothing listening, which is what we want
  }
  if (occupied) {
    throw new Error(
      `Port ${port} is already serving a DEEPER server. Stop it first, or set SMOKE_PORT to a free port.`,
    );
  }
}

async function startServer(port = PORT, extraEnv: Record<string, string> = {}): Promise<ChildProcess> {
  await assertPortFree(port);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) return child;
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  child.kill();
  throw new Error('server did not become healthy in time');
}

/** Sign a webhook body exactly the way RevenueCat does. */
function signedBody(event: Record<string, unknown>, secret: string, whenSeconds = Math.floor(Date.now() / 1000)) {
  const raw = Buffer.from(JSON.stringify({ api_version: '1.0', event }), 'utf8');
  const signature = createHmac('sha256', secret).update(`${whenSeconds}.`).update(raw).digest('hex');
  return {
    raw,
    headers: {
      'content-type': 'application/json',
      'x-revenuecat-webhook-signature': `t=${whenSeconds},v1=${signature}`,
    },
  };
}

/** Read a raw key straight out of Redis so the test can assert on ciphertext. */
async function readRedisValue(url: string, key: string): Promise<string | null> {
  const client = (await import('redis')).createClient({ url });
  client.on('error', () => undefined);
  await client.connect();
  try {
    return await client.get(key);
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function cleanup(pool: pg.Pool): Promise<void> {
  await pool.query(
    `DELETE FROM games WHERE room_id IN (
       SELECT r.id FROM rooms r JOIN users u ON u.id = r.host_user_id
       WHERE u.device_id LIKE 'smoke-%')`,
  );
  await pool.query(
    `DELETE FROM rooms WHERE host_user_id IN (SELECT id FROM users WHERE device_id LIKE 'smoke-%')`,
  );
  await pool.query(`DELETE FROM webhook_events WHERE app_user_id LIKE 'smoke-%'`);
  await pool.query(`DELETE FROM users WHERE device_id LIKE 'smoke-%'`);
}

async function main(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://deeper:deeper@localhost:5432/deeper',
    connectionTimeoutMillis: 4000,
  });
  await cleanup(pool);

  let server: ChildProcess | undefined;
  let host: Socket | undefined;
  let guest: Socket | undefined;

  try {
    server = await startServer(PORT, { REVENUECAT_WEBHOOK_SECRET: WEBHOOK_SECRET });

    host = track(io(BASE_URL, { transports: ['websocket'] }));
    guest = track(io(BASE_URL, { transports: ['websocket'] }));
    await Promise.all([
      new Promise<void>((resolve) => host!.on('connect', () => resolve())),
      new Promise<void>((resolve) => guest!.on('connect', () => resolve())),
    ]);

    console.log('\n1. Room lifecycle');
    const created = await emit<{ roomCode: string; roomId: string; status: string; hostPlayerId: string }>(
      host,
      'room:create',
      { categoryId: 'couples', displayName: 'Ada', deviceKey: HOST_DEVICE, maxPlayers: 2 },
    );
    check('host creates room', created.ok === true);
    if (!created.ok) throw new Error(created.error.message);
    const roomCode = created.data.roomCode;

    const joined = await emit<{ players: unknown[] }>(guest, 'room:join', {
      roomCode,
      displayName: 'Grace',
      deviceKey: GUEST_DEVICE,
    });
    check('guest joins with room code', joined.ok === true);
    if (!joined.ok) throw new Error(joined.error.message);
    check('guest is not the host', created.ok && created.you === created.data.hostPlayerId);

    await waitSnapshot(host, 'host sees both players', (snapshot) => (snapshot.players?.length ?? 0) === 2);
    check('host lobby shows both players', true);

    console.log('\n2. Game start');
    const started = await emit<Snapshot>(host, 'room:start');
    check('host starts game', started.ok === true);
    if (!started.ok) throw new Error(started.error.message);
    check('game is active', started.data.status === 'active');
    const hostQuestion = started.data.currentQuestion?.id;

    const guestView = await waitSnapshot(guest, 'guest receives question', (snapshot) => snapshot.status === 'active');
    check(
      'both devices receive the same question',
      guestView.currentQuestion?.id === hostQuestion,
      `${guestView.currentQuestion?.id} vs ${hostQuestion}`,
    );

    console.log('\n3. Answer privacy');
    const hostSubmit = await emit<Snapshot>(host, 'answer:submit', { answer: 'secret A' });
    check('host submits', hostSubmit.ok === true);
    check('host cannot see answers after own submit', hostSubmit.ok && hostSubmit.data.revealedAnswers === undefined);

    const guestAfterHostSubmit = await waitSnapshot(
      guest,
      'guest sees host submitted',
      (snapshot) => (snapshot.submittedPlayerIds?.length ?? 0) === 1,
    );
    check('guest never receives host answer text', !JSON.stringify(guestAfterHostSubmit).includes('secret A'));
    check('host answer not in any pushed guest snapshot', !JSON.stringify(latest.get(guest) ?? {}).includes('secret A'));

    const guestSubmit = await emit<Snapshot>(guest, 'answer:submit', { answer: 'secret B' });
    check('guest submits', guestSubmit.ok === true);
    check(
      'no answers visible while waiting for reveals',
      guestSubmit.ok && guestSubmit.data.revealedAnswers === undefined,
    );
    check(
      'host snapshot has no answer text before reveal',
      !JSON.stringify(latest.get(host) ?? {}).includes('secret B'),
    );

    console.log('\n4. Synchronised reveal');
    const hostReady = await emit<Snapshot>(host, 'reveal:ready');
    check('first reveal does not expose answers', hostReady.ok && hostReady.data.revealedAnswers === undefined);
    check('host answer still hidden from guest', !JSON.stringify(latest.get(guest) ?? {}).includes('secret A'));

    const guestReady = await emit<Snapshot>(guest, 'reveal:ready');
    check('reveal opens for everyone', guestReady.ok && guestReady.data.phase === 'REVEAL');
    const revealed = guestReady.ok ? guestReady.data.revealedAnswers ?? [] : [];
    check('both answers revealed together', revealed.length === 2);
    check(
      'revealed set contains both answers',
      revealed.some((item) => item.answer === 'secret A') && revealed.some((item) => item.answer === 'secret B'),
    );

    console.log('\n5. Reactions and progression');
    const reacted = await emit<Snapshot>(guest, 'reaction:send', { reaction: 'love' });
    check('guest reaction accepted', reacted.ok === true);
    const next = await emit<Snapshot>(host, 'question:next');
    check('advances to question 2', next.ok === true && next.data.questionNumber === 2);
    await waitSnapshot(guest, 'guest advances too', (snapshot) => snapshot.questionNumber === 2);
    check('guest advances to question 2', true);

    console.log('\n6. Reconnection (phone backgrounded mid-game)');
    const roomId = created.data.roomId;
    const guestPlayerId = joined.you;

    // The guest locks their phone: the socket drops and the server sees a
    // disconnect. The room itself must survive.
    guest.disconnect();
    await sleep(250);

    // Coming back to the foreground yields a brand new socket.id.
    const rejoined = track(io(BASE_URL, { transports: ['websocket'] }));
    await new Promise<void>((resolve) => rejoined.on('connect', () => resolve()));
    guest = rejoined;

    const resumed = await emit<Snapshot>(rejoined, 'session:resume', {
      roomId,
      playerId: guestPlayerId,
      deviceKey: GUEST_DEVICE,
    });
    check('resume succeeds on a fresh socket', resumed.ok === true, resumed.ok ? '' : resumed.error.message);
    check(
      'resumed client keeps its original player identity',
      resumed.ok && resumed.you === guestPlayerId,
    );
    check(
      'resumed client is restored to the live question',
      resumed.ok && resumed.data.questionNumber === 2,
      String(resumed.ok ? resumed.data.questionNumber : undefined),
    );
    check(
      'resume does not create a second seat',
      resumed.ok && (resumed.data.players?.length ?? 0) === 2,
      String(resumed.ok ? resumed.data.players?.length : undefined),
    );

    const resumedSubmit = await emit<Snapshot>(rejoined, 'answer:submit', { answer: 'back again' });
    check('resumed client can act on the game again', resumedSubmit.ok === true);
    await waitSnapshot(host, 'host sees the guest back', (snapshot) =>
      (snapshot.players ?? []).some((player) => (player as { connected?: boolean }).connected === true),
    );
    check('host is told the guest reconnected', true);

    const staleRoom = await emit<Snapshot>(rejoined, 'session:resume', {
      roomId: '00000000-0000-0000-0000-000000000000',
      playerId: guestPlayerId,
    });
    check(
      'resume into a dead room is rejected, not silently accepted',
      !staleRoom.ok && staleRoom.error.code === 'ROOM_EXPIRED',
    );
    check('dead-room rejection carries player-facing copy', !staleRoom.ok && staleRoom.error.message.length > 10);

    const wrongPlayer = await emit<Snapshot>(rejoined, 'session:resume', {
      roomId,
      playerId: 'not-a-real-player',
    });
    check(
      'resume with an unknown player is rejected',
      !wrongPlayer.ok && wrongPlayer.error.code === 'RESUME_NOT_FOUND',
    );

    console.log('\n7. Early exit');
    const ended = await emit<Snapshot>(host, 'room:end');
    check('host ends game early', ended.ok === true && ended.data.status === 'ended');
    check('ended reason recorded', ended.ok && ended.data.endedReason === 'host-ended');

    await sleep(600); // let async persistence settle

    console.log('\n8. Postgres persistence');
    const users = await pool.query(
      `SELECT device_id, free_hosted_games_remaining, premium_entitlement
         FROM users WHERE device_id LIKE 'smoke-%' ORDER BY device_id`,
    );
    check('two durable users persisted', users.rowCount === 2, `got ${users.rowCount}`);
    const hostRow = users.rows.find((row) => row.device_id === HOST_DEVICE);
    const guestRow = users.rows.find((row) => row.device_id === GUEST_DEVICE);
    check(
      'host charged exactly one free game (10 → 9)',
      hostRow?.free_hosted_games_remaining === 9,
      String(hostRow?.free_hosted_games_remaining),
    );
    check(
      'guest never charged (still 10)',
      guestRow?.free_hosted_games_remaining === 10,
      String(guestRow?.free_hosted_games_remaining),
    );

    const rooms = await pool.query(
      `SELECT r.status FROM rooms r JOIN users u ON u.id = r.host_user_id WHERE u.device_id = $1`,
      [HOST_DEVICE],
    );
    check('room persisted', rooms.rowCount === 1, String(rooms.rowCount));
    check('room status is ended', rooms.rows[0]?.status === 'ended', String(rooms.rows[0]?.status));

    const roomPlayers = await pool.query(
      `SELECT count(*)::int AS n FROM room_players rp
         JOIN rooms r ON r.id = rp.room_id JOIN users u ON u.id = r.host_user_id
        WHERE u.device_id = $1`,
      [HOST_DEVICE],
    );
    check('two room_players persisted', roomPlayers.rows[0]?.n === 2, String(roomPlayers.rows[0]?.n));

    const games = await pool.query(
      `SELECT g.end_reason FROM games g JOIN users u ON u.id = g.host_user_id WHERE u.device_id = $1`,
      [HOST_DEVICE],
    );
    check('one game row persisted', games.rowCount === 1, String(games.rowCount));
    check('end reason recorded', games.rows[0]?.end_reason === 'host-ended', String(games.rows[0]?.end_reason));

    const gamePlayers = await pool.query(
      `SELECT count(*)::int AS n FROM game_players gp
         JOIN games g ON g.id = gp.game_id JOIN users u ON u.id = g.host_user_id
        WHERE u.device_id = $1`,
      [HOST_DEVICE],
    );
    check('two game_players persisted', gamePlayers.rows[0]?.n === 2, String(gamePlayers.rows[0]?.n));

    const gameQuestions = await pool.query(
      `SELECT count(*)::int AS n FROM game_questions gq
         JOIN games g ON g.id = gq.game_id JOIN users u ON u.id = g.host_user_id
        WHERE u.device_id = $1`,
      [HOST_DEVICE],
    );
    check('ten game_questions persisted', gameQuestions.rows[0]?.n === 10, String(gameQuestions.rows[0]?.n));

    const reactions = await pool.query(
      `SELECT count(*)::int AS n FROM reactions r
         JOIN games g ON g.id = r.game_id JOIN users u ON u.id = g.host_user_id
        WHERE u.device_id = $1`,
      [HOST_DEVICE],
    );
    check('reaction persisted', reactions.rows[0]?.n === 1, String(reactions.rows[0]?.n));

    const answerTables = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('answers', 'answer')`,
    );
    check('no answers table exists (answers stay ephemeral)', answerTables.rows[0]?.n === 0);

    console.log('\n9. DEEPER+ deck gating');
    // A free account must not be able to open a premium deck, and must not be
    // able to do it by lying about who they are.
    const premiumAttempt = await emit<{ roomCode: string }>(host, 'room:create', {
      categoryId: 'late-night',
      displayName: 'Ada',
      deviceKey: HOST_DEVICE,
    });
    check(
      'free account is blocked from a premium deck',
      !premiumAttempt.ok && premiumAttempt.error.code === 'PREMIUM_REQUIRED',
      premiumAttempt.ok ? 'server allowed it' : premiumAttempt.error.code,
    );
    check(
      'premium rejection tells the player why',
      !premiumAttempt.ok && /DEEPER\+/.test(premiumAttempt.error.message),
      premiumAttempt.ok ? '' : premiumAttempt.error.message,
    );

    const freeStillWorks = await emit<{ roomCode: string }>(host, 'room:create', {
      categoryId: 'couples',
      displayName: 'Ada',
      deviceKey: HOST_DEVICE,
    });
    check('free decks still open for the same account', freeStillWorks.ok === true);

    const adultGate = await emit(host, 'room:create', {
      categoryId: 'after-dark',
      displayName: 'Ada',
      deviceKey: HOST_DEVICE,
    });
    check(
      'age-gated deck still requires confirmation',
      !adultGate.ok && adultGate.error.code === 'AGE_CONFIRMATION_REQUIRED',
      adultGate.ok ? 'server allowed it' : adultGate.error.code,
    );

    // The documented dev escape hatch: PREMIUM_ENFORCEMENT=off must actually
    // unlock the decks, otherwise nobody can test them before RevenueCat.
    const openPort = PORT + 1;
    const openServer = await startServer(openPort, { PREMIUM_ENFORCEMENT: 'off' });
    try {
      const openClient = io(`http://localhost:${openPort}`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => openClient.on('connect', () => resolve()));
      const openAttempt = await emit<{ roomCode: string }>(openClient, 'room:create', {
        categoryId: 'late-night',
        displayName: 'Test',
        deviceKey: 'smoke-premium-off-0004',
      });    check(
      'PREMIUM_ENFORCEMENT=off unlocks premium decks locally',
      openAttempt.ok === true,
      openAttempt.ok ? '' : openAttempt.error.code,
    );
      openClient.disconnect();
    } finally {
      openServer.kill();
    }

    // Only meaningful against a real Redis, so CI sets SMOKE_REDIS_URL.
    const redisUrl = process.env.SMOKE_REDIS_URL;
    if (redisUrl) {
      console.log('\n10. Live state survives a full server restart (Redis)');
      const secret = 'smoke-live-state-secret-value-32b';
      const restartPort = PORT + 2;
      const url = `http://localhost:${restartPort}`;

      const firstServer = await startServer(restartPort, {
        REDIS_URL: redisUrl,
        LIVE_STATE_SECRET: secret,
      });
      const connect = async () => {
        const client = io(url, { transports: ['websocket'] });
        await new Promise<void>((resolve) => client.on('connect', () => resolve()));
        return client;
      };

      let a: Awaited<ReturnType<typeof connect>> | undefined;
      let b: Awaited<ReturnType<typeof connect>> | undefined;
      try {
        a = await connect();
        b = await connect();

        const restartRoom = await emit<{ roomId: string; roomCode: string; hostPlayerId: string }>(
          a,
          'room:create',
          { categoryId: 'deep', displayName: 'Ada', deviceKey: 'smoke-restart-host', maxPlayers: 2 },
        );
        check('restart fixture room created', restartRoom.ok === true);
        if (!restartRoom.ok) throw new Error(restartRoom.error.message);

        const restartGuest = await emit<{ players: unknown[] }>(b, 'room:join', {
          roomCode: restartRoom.data.roomCode,
          displayName: 'Grace',
          deviceKey: 'smoke-restart-guest',
        });
        check('restart fixture guest joined', restartGuest.ok === true);
        if (!restartGuest.ok) throw new Error(restartGuest.error.message);

        await emit(a, 'room:start');
        await emit(a, 'answer:submit', { answer: 'REDIS_ANSWER_A' });
        await emit(b, 'answer:submit', { answer: 'REDIS_ANSWER_B' });
        await sleep(300); // let the mirror write land

        // Hard kill: no graceful shutdown, no chance to flush anything.
        a.disconnect();
        b.disconnect();
        firstServer.kill();
        await sleep(800);

        const secondServer = await startServer(restartPort, {
          REDIS_URL: redisUrl,
          LIVE_STATE_SECRET: secret,
        });
        try {
          const c = await connect();
          const d = await connect();

          const restoredHost = await emit<Snapshot>(c, 'session:resume', {
            roomId: restartRoom.data.roomId,
            playerId: restartRoom.data.hostPlayerId,
            deviceKey: 'smoke-restart-host',
          });
          check(
            'room is restored from Redis after a hard restart',
            restoredHost.ok === true,
            restoredHost.ok ? '' : restoredHost.error.code,
          );
          check(
            'restored room is still mid-question-1',
            restoredHost.ok && restoredHost.data.questionNumber === 1,
          );
          check(
            'restored room kept both players',
            restoredHost.ok && (restoredHost.data.players?.length ?? 0) === 2,
          );
          check(
            'restored room never exposed answers before the reveal',
            restoredHost.ok && restoredHost.data.revealedAnswers === undefined,
          );

          const restoredGuest = await emit<Snapshot>(d, 'session:resume', {
            roomId: restartRoom.data.roomId,
            playerId: restartGuest.you,
            deviceKey: 'smoke-restart-guest',
          });
          check('guest also resumes into the restored room', restoredGuest.ok === true);

          await emit(c, 'reveal:ready');
          const revealed = await emit<Snapshot>(d, 'reveal:ready');
          const revealedAnswers = revealed.ok ? revealed.data.revealedAnswers ?? [] : [];
          check(
            'both answers survived the restart and revealed together',
            revealed.ok &&
              revealedAnswers.some((item) => item.answer === 'REDIS_ANSWER_A') &&
              revealedAnswers.some((item) => item.answer === 'REDIS_ANSWER_B'),
            JSON.stringify(revealedAnswers.map((item) => item.answer)),
          );

          // The ciphertext in Redis must not be readable without the key.
          const raw = await readRedisValue(redisUrl, `deeper:room:${restartRoom.data.roomId}`);
          check('room was written to Redis', typeof raw === 'string' && raw.length > 0);
          check(
            'answers are encrypted at rest, not plaintext',
            typeof raw === 'string' && !raw.includes('REDIS_ANSWER_A'),
          );

          c.disconnect();
          d.disconnect();
        } finally {
          secondServer.kill();
        }
      } finally {
        a?.disconnect();
        b?.disconnect();
        firstServer.kill();
      }
    } else {
      console.log('\n10. Live state restart test SKIPPED (set SMOKE_REDIS_URL to enable)');
    }

    console.log('\n11. RevenueCat webhook → server-side entitlement');
    // Create a real user row so the webhook has someone to grant access to.
    const webhookDevice = 'smoke-webhook-device';
    const webhookRoom = await emit<{ roomId: string }>(host, 'room:create', {
      categoryId: 'deep',
      displayName: 'Buyer',
      deviceKey: webhookDevice,
      maxPlayers: 2,
    });
    check('webhook fixture user created', webhookRoom.ok === true);

    const transactionId = `smoke-tx-${RUN_ID}`;

    const post = async (payload: { raw: Buffer; headers: Record<string, string> }) => {
      const response = await fetch(`${BASE_URL}/webhooks/revenuecat`, {
        method: 'POST',
        headers: payload.headers,
        // A fresh Uint8Array view: fetch's BodyInit does not accept a Node Buffer
        // directly, and we must send the exact bytes we signed.
        body: new Uint8Array(payload.raw),
      });
      return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
    };

    const purchaseEvent = {
      type: 'INITIAL_PURCHASE',
      id: `smoke-evt-1-${RUN_ID}`,
      app_user_id: webhookDevice,
      product_id: 'deeper_plus_yearly',
      transaction_id: transactionId,
      entitlement_ids: ['deeper_plus'],
      expiration_at_ms: Date.now() + 31_536_000_000,
      environment: 'PRODUCTION',
    };

    // 1. Unsigned request must be refused.
    const unsigned = await post({ raw: Buffer.from(JSON.stringify({ event: purchaseEvent })), headers: { 'content-type': 'application/json' } });
    check('unsigned webhook is rejected', unsigned.status === 401, `got ${unsigned.status}`);

    // 2. Wrong secret must be refused.
    const wrongSecret = await post(signedBody(purchaseEvent, 'not-the-real-secret-value'));
    check('webhook signed with the wrong secret is rejected', wrongSecret.status === 401, `got ${wrongSecret.status}`);

    // 3. Tampered body with a valid header must be refused (the whole point of
    //    verifying the raw bytes rather than the parsed object).
    const legit = signedBody(purchaseEvent, WEBHOOK_SECRET);
    const tamperedRaw = Buffer.from(legit.raw);
    const flipAt = tamperedRaw.length - 3;
    tamperedRaw[flipAt] = (tamperedRaw[flipAt] ?? 0) ^ 0x01;
    const tampered = await post({ raw: tamperedRaw, headers: legit.headers });
    check('tampered webhook body is rejected', tampered.status === 401, `got ${tampered.status}`);

    // 4. A correctly signed purchase grants server-side premium.
    const granted = await post(signedBody(purchaseEvent, WEBHOOK_SECRET));
    check('signed purchase is accepted', granted.status === 200, `got ${granted.status}`);
    check('purchase is applied', granted.body.applied === true);

    const afterGrant = await pool.query(
      `SELECT premium_entitlement FROM users WHERE device_id = $1`,
      [webhookDevice],
    );
    check('users.premium_entitlement is now true', afterGrant.rows[0]?.premium_entitlement === true);

    const entitlementRows = await pool.query(
      `SELECT active, expires_at FROM entitlements
        WHERE user_id = (SELECT id FROM users WHERE device_id = $1)
          AND provider = 'revenuecat' AND entitlement_key = 'deeper_plus'`,
      [webhookDevice],
    );
    check('entitlement row written', entitlementRows.rowCount === 1);
    check('entitlement is active', entitlementRows.rows[0]?.active === true);
    check('entitlement expiry recorded', entitlementRows.rows[0]?.expires_at instanceof Date);

    const purchaseRows = await pool.query(
      `SELECT count(*)::int AS n FROM purchases
        WHERE user_id = (SELECT id FROM users WHERE device_id = $1) AND transaction_id = $2`,
      [webhookDevice, transactionId],
    );
    check('purchase row written', purchaseRows.rows[0]?.n === 1);

    // 5. A retried delivery must be a no-op, not a second sale.
    const retried = await post(signedBody(purchaseEvent, WEBHOOK_SECRET));
    check('duplicate delivery is acknowledged', retried.status === 200);
    check('duplicate delivery is flagged', retried.body.duplicate === true);
    const purchaseRowsAfterRetry = await pool.query(
      `SELECT count(*)::int AS n FROM purchases WHERE transaction_id = $1`,
      [transactionId],
    );
    check('duplicate delivery did not duplicate the purchase', purchaseRowsAfterRetry.rows[0]?.n === 1);
    const eventRows = await pool.query(
      `SELECT count(*)::int AS n FROM webhook_events WHERE event_id = $1`,
      [purchaseEvent.id],
    );
    check('event recorded exactly once', eventRows.rows[0]?.n === 1);

    // 6. CANCELLATION must not revoke: the subscriber paid until period end.
    const cancelled = await post(signedBody({ ...purchaseEvent, id: `smoke-evt-2-${RUN_ID}`, type: 'CANCELLATION' }, WEBHOOK_SECRET));
    check('cancellation is accepted', cancelled.status === 200);
    check('cancellation does not apply a change', cancelled.body.applied === false);
    const afterCancel = await pool.query(
      `SELECT premium_entitlement FROM users WHERE device_id = $1`,
      [webhookDevice],
    );
    check('premium survives cancellation', afterCancel.rows[0]?.premium_entitlement === true);

    // 7. EXPIRATION is what actually removes access.
    const expired = await post(signedBody({ ...purchaseEvent, id: `smoke-evt-3-${RUN_ID}`, type: 'EXPIRATION' }, WEBHOOK_SECRET));
    check('expiration is accepted', expired.status === 200);
    check('expiration revokes', expired.body.effect === 'revoke');
    const afterExpiry = await pool.query(
      `SELECT premium_entitlement FROM users WHERE device_id = $1`,
      [webhookDevice],
    );
    check('premium_entitlement is false after expiry', afterExpiry.rows[0]?.premium_entitlement === false);

    // 8. An event for a user we have never seen is acked, not retried forever.
    const orphan = await post(signedBody({ ...purchaseEvent, id: `smoke-evt-4-${RUN_ID}`, app_user_id: 'smoke-ghost-device' }, WEBHOOK_SECRET));
    check('unknown user is acknowledged, not retried', orphan.status === 200);
    check('unknown user is not applied', orphan.body.applied === false);
    check('unknown user is reported', orphan.body.reason === 'unknown-user');
  } finally {
    host?.disconnect();
    guest?.disconnect();
    if (server) server.kill();
    await cleanup(pool).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

main().catch((error) => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
