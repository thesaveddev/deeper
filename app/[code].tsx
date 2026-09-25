import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';

export default function DeepLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (code && typeof code === 'string' && code.length === 4) {
      // Navigate to join screen with the code pre-filled
      router.replace({ pathname: '/join', params: { code: code.toUpperCase() } });
    } else {
      // Invalid code, go home
      router.replace('/');
    }
  }, [code]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ActivityIndicator size="large" color={theme.pink} />
      <Text style={styles.title}>Opening DEEPER...</Text>
      <Text style={styles.sub}>Joining room {code ?? '...'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
  title: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 20 },
  sub: { color: theme.muted, fontSize: 14, marginTop: 8 },
});
