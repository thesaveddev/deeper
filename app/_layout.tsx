import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameProvider } from '@/src/lib/game-store';
import { initSentry } from '@/src/lib/sentry';
import { configureNotificationHandler, requestNotificationPermissions } from '@/src/lib/notifications';
import { initAnalytics, trackAppOpened } from '@/src/lib/analytics';
import { loadIdentity } from '@/src/lib/session';

export default function RootLayout() {
  useEffect(() => {
    initSentry();
    configureNotificationHandler();
    void requestNotificationPermissions();
    void loadIdentity().then((id) => {
      initAnalytics(id.playerId);
      trackAppOpened();
    });
  }, []);

  return (
    <SafeAreaProvider>
      <GameProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: '#0D0D12' },
          }}
        />
      </GameProvider>
    </SafeAreaProvider>
  );
}
