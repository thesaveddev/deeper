import AsyncStorage from '@react-native-async-storage/async-storage';

const STREAK_KEY = 'deeper.daily_streak';
const LAST_DATE_KEY = 'deeper.daily_last_date';

export interface StreakData {
  count: number;
  lastDate: string;
}

function today(): string {
  return new Date().toISOString().split('T')[0]!;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0]!;
}

export async function getStreak(): Promise<StreakData> {
  const count = parseInt((await AsyncStorage.getItem(STREAK_KEY)) ?? '0', 10);
  const lastDate = (await AsyncStorage.getItem(LAST_DATE_KEY)) ?? '';
  return { count, lastDate };
}

export async function markDailyComplete(): Promise<StreakData> {
  const { count, lastDate } = await getStreak();
  const t = today();

  if (lastDate === t) {
    // Already completed today
    return { count, lastDate };
  }

  let newCount: number;
  if (lastDate === yesterday()) {
    // Consecutive day
    newCount = count + 1;
  } else {
    // Streak broken or first time
    newCount = 1;
  }

  await AsyncStorage.setItem(STREAK_KEY, String(newCount));
  await AsyncStorage.setItem(LAST_DATE_KEY, t);

  return { count: newCount, lastDate: t };
}

export async function hasCompletedToday(): Promise<boolean> {
  const { lastDate } = await getStreak();
  return lastDate === today();
}
