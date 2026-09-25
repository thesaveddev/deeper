/**
 * Free hosted games allowance.
 *
 * Rules (from the spec):
 * - Every new user starts with 10 free games.
 * - Creating a room does NOT consume a game; only the host starting one does.
 * - A room is charged exactly once, so reconnects and reloads never double-charge.
 * - Guests joining another host's room are never charged.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FREE_HOSTED_GAMES } from '@deeper/shared';

const COUNT_KEY = 'deeper.freeGames';
const CONSUMED_KEY = 'deeper.consumedRooms';
const MAX_CONSUMED_IDS = 50;

let remaining = FREE_HOSTED_GAMES;

export async function loadFreeGames(): Promise<number> {
  const stored = await AsyncStorage.getItem(COUNT_KEY);
  const parsed = stored === null ? NaN : Number.parseInt(stored, 10);
  remaining = Number.isFinite(parsed) && parsed >= 0 && parsed <= FREE_HOSTED_GAMES ? parsed : FREE_HOSTED_GAMES;
  if (stored === null) await AsyncStorage.setItem(COUNT_KEY, String(remaining));
  return remaining;
}

export function getFreeGames(): number {
  return remaining;
}

export async function consumeFreeGame(): Promise<number> {
  if (remaining <= 0) return remaining;
  remaining -= 1;
  await AsyncStorage.setItem(COUNT_KEY, String(remaining));
  return remaining;
}

export async function resetFreeGames(): Promise<number> {
  remaining = FREE_HOSTED_GAMES;
  await AsyncStorage.removeItem(COUNT_KEY);
  await AsyncStorage.removeItem(CONSUMED_KEY);
  return remaining;
}

/** Rooms already charged for, restored from storage so a restart never re-charges. */
export async function loadConsumedRooms(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(CONSUMED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function markRoomConsumed(roomId: string): Promise<void> {
  const current = await loadConsumedRooms();
  if (current.includes(roomId)) return;
  const next = [...current, roomId].slice(-MAX_CONSUMED_IDS);
  await AsyncStorage.setItem(CONSUMED_KEY, JSON.stringify(next));
}
