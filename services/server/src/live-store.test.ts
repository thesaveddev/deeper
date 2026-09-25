/**
 * Unit coverage for the live-state codec and answer encryption.
 *
 * These deliberately avoid a real Redis server: the risky part is the
 * serialisation and the AES envelope, both of which are pure functions. The
 * wire behaviour against an actual Redis is covered by the integration job.
 */

import { describe, expect, it } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { __testing } from './live-store.js';
import { GameRoom, type RoomPlayer } from './game-room.js';

const { encrypt, decrypt, serializeRoom, deserializeRoom } = __testing;

const KEY = scryptSync('test-secret-value', 'deeper.live.v1', 32);
const OTHER_KEY = scryptSync('a-different-secret', 'deeper.live.v1', 32);

function makeRoom(): GameRoom {
  const host: RoomPlayer = {
    playerId: 'host-1',
    displayName: 'Ada',
    sessionId: 'session-1',
    isHost: true,
    connected: true,
    joinedAt: new Date().toISOString(),
  };
  const room = new GameRoom('couples', host, 2);
  room.addPlayer({
    playerId: 'guest-1',
    displayName: 'Grace',
    sessionId: 'session-2',
    isHost: false,
    connected: true,
    joinedAt: new Date().toISOString(),
  });
  return room;
}

describe('answer encryption', () => {
  it('round-trips an answer', () => {
    expect(decrypt(encrypt('we met at a bus stop', KEY), KEY)).toBe('we met at a bus stop');
  });

  it('produces a different ciphertext each time (fresh IV)', () => {
    expect(encrypt('same text', KEY)).not.toBe(encrypt('same text', KEY));
  });

  it('handles unicode and long answers', () => {
    const answer = '❤️ '.repeat(200);
    expect(decrypt(encrypt(answer, KEY), KEY)).toBe(answer);
  });

  it('refuses to decrypt with the wrong key instead of throwing', () => {
    expect(decrypt(encrypt('private', KEY), OTHER_KEY)).toBeNull();
  });

  it('rejects tampered ciphertext', () => {
    const blob = encrypt('private', KEY);
    const bytes = Buffer.from(blob, 'base64');
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0xff;
    expect(decrypt(bytes.toString('base64'), KEY)).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(decrypt('not-a-real-blob', KEY)).toBeNull();
    expect(decrypt('', KEY)).toBeNull();
  });
});

describe('room serialisation', () => {
  it('round-trips a live mid-round state including private answers', () => {
    const room = makeRoom();
    room.start('host-1', true);
    room.submit('host-1', 'a rainy evening in Lagos');
    room.submit('guest-1', 'the ferry terminal');

    const restored = deserializeRoom(serializeRoom(room.state, KEY), KEY);

    expect(restored.roomId).toBe(room.state.roomId);
    expect(restored.roomCode).toBe(room.state.roomCode);
    expect(restored.status).toBe('active');
    expect(restored.questionNumber).toBe(1);
    expect(restored.phase).toBe(room.state.phase);
    expect(restored.answers.get('host-1')).toBe('a rainy evening in Lagos');
    expect(restored.answers.get('guest-1')).toBe('the ferry terminal');
    expect(restored.players.size).toBe(2);
    expect(restored.questions).toEqual(room.state.questions);
  });

  it('never writes answer text in the clear', () => {
    const room = makeRoom();
    room.start('host-1', true);
    room.submit('host-1', 'a rainy evening in Lagos');

    const raw = JSON.stringify(serializeRoom(room.state, KEY));
    expect(raw).not.toContain('a rainy evening in Lagos');
  });

  it('omits answers entirely when no secret is configured', () => {
    const room = makeRoom();
    room.start('host-1', true);
    room.submit('host-1', 'never written');

    const payload = serializeRoom(room.state, null);
    expect(payload.answers).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('never written');

    // The room itself still survives; only the in-flight round is lost.
    const restored = deserializeRoom(payload, null);
    expect(restored.status).toBe('active');
    expect(restored.answers.size).toBe(0);
  });

  it('drops stale socket ids so nobody emits into the void', () => {
    const room = makeRoom();
    room.state.players.get('host-1')!.socketId = 'socket-from-a-dead-process';

    const restored = deserializeRoom(serializeRoom(room.state, KEY), KEY);
    const restoredPlayer = restored.players.get('host-1');
    expect(restoredPlayer?.socketId).toBeUndefined();
    expect(restoredPlayer?.connected).toBe(false);
  });

  it('round-trips prediction mode scores', () => {
    const host: RoomPlayer = {
      playerId: 'host-1',
      displayName: 'Ada',
      sessionId: 'session-1',
      isHost: true,
      connected: true,
      joinedAt: new Date().toISOString(),
    };
    const room = new GameRoom('know-me', host, 2);
    room.addPlayer({
      playerId: 'guest-1',
      displayName: 'Grace',
      sessionId: 'session-2',
      isHost: false,
      connected: true,
      joinedAt: new Date().toISOString(),
    });
    room.start('host-1', true);
    room.submit('guest-1', 'blue');
    room.predict('host-1', 'blue');

    const restored = deserializeRoom(serializeRoom(room.state, KEY), KEY);
    expect(restored.predictions.get('host-1')).toBe('blue');
    expect(restored.answers.get('guest-1')).toBe('blue');
  });

  it('is not fooled by a key that rotates between writes and reads', () => {
    const room = makeRoom();
    room.start('host-1', true);
    room.submit('host-1', 'written with the old key');
    const payload = serializeRoom(room.state, KEY);

    const restored = deserializeRoom(payload, scryptSync(randomBytes(32).toString('hex'), 'deeper.live.v1', 32));
    expect(restored.answers.size).toBe(0);
    expect(restored.roomCode).toBe(room.state.roomCode);
  });
});
