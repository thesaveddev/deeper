import { describe, expect, it } from 'vitest';
import { GameRoom } from './game-room.js';
import type { RoomPlayer } from './game-room.js';

const player = (playerId: string, name: string, host = false): RoomPlayer => ({ playerId, displayName: name, sessionId: `${playerId}-session`, isHost: host, connected: true, joinedAt: new Date().toISOString() });

describe('GameRoom', () => {
  it('keeps answers private until every player is ready to reveal', () => {
    const room = new GameRoom('couples', player('a', 'A', true));
    room.addPlayer(player('b', 'B'));
    room.start('a', true);
    room.submit('a', 'private A');
    room.submit('b', 'private B');
    const waiting = room.snapshot();
    expect(waiting.revealedAnswers).toBeUndefined();
    room.readyReveal('a');
    expect(room.snapshot().revealedAnswers).toBeUndefined();
    room.readyReveal('b');
    expect(room.snapshot().phase).toBe('REVEAL');
    expect(room.snapshot().revealedAnswers?.map((answer) => answer.answer)).toEqual(['private A', 'private B']);
  });

  it('deducts the host credit only when the host starts, not when a lobby is created', () => {
    const room = new GameRoom('deep', player('a', 'A', true));
    room.addPlayer(player('b', 'B'));
    expect(room.state.consumedCredit).toBe(false);
    room.start('a', true);
    expect(room.state.consumedCredit).toBe(true);
    room.setConnection('b', false);
    room.setConnection('b', true);
    expect(room.state.consumedCredit).toBe(true);
  });

  it('allows the host to end early without changing the consumed-credit state', () => {
    const room = new GameRoom('couples', player('a', 'A', true));
    room.addPlayer(player('b', 'B'));
    room.start('a', true);
    room.end('a');
    expect(room.snapshot().status).toBe('ended');
    expect(room.snapshot().endedReason).toBe('host-ended');
    expect(room.state.consumedCredit).toBe(true);
  });
});
