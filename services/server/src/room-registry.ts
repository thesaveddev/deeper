/**
 * In-memory room cache backed by Redis.
 *
 * The registry is the only thing the socket handlers talk to. Reads are
 * synchronous when the room is already hot, and transparently rehydrate from
 * Redis when they are not — which is exactly the case after a server restart.
 *
 * With Redis absent every method degrades to plain in-memory behaviour, so the
 * game is fully playable either way.
 */

import { GameRoom, type RoomPlayer } from './game-room.js';
import type { CategoryId } from '@deeper/shared';
import { findRoomIdByCode, forgetRoom, liveStoreEnabled, persistRoom, restoreRoom } from './live-store.js';

export class RoomRegistry {
  private readonly cache = new Map<string, GameRoom>();

  create(categoryId: CategoryId, host: RoomPlayer, maxPlayers: number): GameRoom {
    const room = new GameRoom(categoryId, host, maxPlayers);
    this.adopt(room);
    return room;
  }

  /** Wire persistence and start tracking a room as hot. */
  private adopt(room: GameRoom): GameRoom {
    room.setOnChange((changed) => {
      void persistRoom(changed.state);
    });
    this.cache.set(room.state.roomId, room);
    return room;
  }

  async get(roomId: string): Promise<GameRoom | undefined> {
    const hot = this.cache.get(roomId);
    if (hot) return hot;
    const state = await restoreRoom(roomId);
    if (!state) return undefined;
    return this.adopt(GameRoom.fromState(state));
  }

  async getByCode(roomCode: string): Promise<GameRoom | undefined> {
    for (const room of this.cache.values()) {
      if (room.state.roomCode === roomCode) return room;
    }
    const roomId = await findRoomIdByCode(roomCode);
    if (!roomId) return undefined;
    return this.get(roomId);
  }

  /** Hot rooms only — the TTL sweep never needs to resurrect a cold one. */
  values(): GameRoom[] {
    return [...this.cache.values()];
  }

  evict(roomId: string): void {
    this.cache.delete(roomId);
  }

  /** Drop a room and its ciphertext entirely (expiry path). */
  async purge(room: GameRoom): Promise<void> {
    this.cache.delete(room.state.roomId);
    await forgetRoom(room.state);
  }

  get durable(): boolean {
    return liveStoreEnabled();
  }
}
