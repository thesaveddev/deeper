/**
 * Push Notifications Adapter
 *
 * This module handles push notifications for:
 * - Player joins your room
 * - Game starting
 * - New daily question
 *
 * IMPORTANT: expo-notifications throws on import inside Expo Go (Android push
 * support was removed in SDK 53), and this module is imported by the game
 * store, which every screen depends on. A static import here crashes the whole
 * route graph ("missing default export" on every route). It is therefore loaded
 * lazily behind try/catch and every call is guarded: when the notifications
 * stack is unavailable (Expo Go), everything degrades to a no-op.
 */

type NotificationsModule = typeof import('expo-notifications');

let cachedModule: NotificationsModule | null = null;
let loadAttempted = false;
let configured = false;
let registered = false;

function getNotifications(): NotificationsModule | null {
  if (loadAttempted) return cachedModule;
  loadAttempted = true;
  try {
    cachedModule = require('expo-notifications') as NotificationsModule;
  } catch {
    cachedModule = null;
    if (__DEV__) console.log('[notifications] not available in this environment — push disabled');
  }
  return cachedModule;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (registered) return true;
  const Notifications = getNotifications();
  if (!Notifications) return false;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    registered = finalStatus === 'granted';
    return registered;
  } catch {
    return false;
  }
}

export async function schedulePlayerJoinNotification(hostName: string, roomCode: string): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Someone joined your room!',
        body: `${hostName} is ready to play. Room code: ${roomCode}`,
        sound: true,
      },
      trigger: null, // immediate
    });
  } catch {
    // Notifications unavailable in this environment — ignore.
  }
}

export async function scheduleGameStartNotification(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Game starting!',
        body: 'The conversation is about to begin.',
        sound: true,
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
}

export async function scheduleDailyQuestionNotification(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'New daily question!',
        body: 'Answer today\'s question to keep your streak going.',
        sound: true,
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
}

export function configureNotificationHandler(): void {
  if (configured) return;
  const Notifications = getNotifications();
  if (!Notifications) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    configured = true;
  } catch {
    // ignore
  }
}
