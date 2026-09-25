import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'deeper.identity';
const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export interface LocalIdentity { playerId: string; displayName: string; sessionId: string; }

export async function loadIdentity(): Promise<LocalIdentity> {
  const saved = await AsyncStorage.getItem(KEY);
  if (saved) return JSON.parse(saved) as LocalIdentity;
  const identity = { playerId: randomId(), displayName: 'You', sessionId: randomId() };
  await AsyncStorage.setItem(KEY, JSON.stringify(identity));
  return identity;
}

export async function saveDisplayName(displayName: string) {
  const identity = await loadIdentity();
  const next = { ...identity, displayName: displayName.trim() || identity.displayName };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
