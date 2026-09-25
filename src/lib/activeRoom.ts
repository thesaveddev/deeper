import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'deeper.activeRoom';

/**
 * The room this device is currently sitting in. Survives an app restart, so a
 * player who backgrounds the game mid-round (iOS suspends the socket after a
 * few seconds) can be re-bound to their seat instead of being stranded on a
 * frozen screen.
 */
export interface ActiveRoom {
  roomId: string;
  playerId: string;
  roomCode: string;
  deviceKey: string;
}

export async function loadActiveRoom(): Promise<ActiveRoom | null> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as ActiveRoom;
    if (!parsed?.roomId || !parsed?.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveActiveRoom(room: ActiveRoom): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(room));
  } catch {
    // A failed write only costs us an automatic rejoin; never break the game.
  }
}

export async function clearActiveRoom(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
