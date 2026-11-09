import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/src/lib/game-store';
import { resetFreeGames } from '@/src/lib/freeGames';
import { logoutPremium } from '@/src/lib/premium';
import { theme } from '@/src/lib/theme';

const MENU_ITEMS: Array<{ label: string; action: string; destructive?: boolean }> = [
  { label: 'Display name', action: 'name' },
  { label: 'Notifications', action: 'notifications' },
  { label: 'Privacy policy', action: 'privacy' },
  { label: 'Terms', action: 'terms' },
  { label: 'Delete local data', action: 'delete', destructive: true },
  { label: 'About DEEPER', action: 'about' },
];

export default function ProfileScreen() {
  const { identity, freeGames, premium, refreshAccount, reloadIdentity } = useGame();
  const insets = useSafeAreaInsets();
  const displayName = identity?.displayName ?? 'You';

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  const handleItem = (action: string) => {
    switch (action) {
      case 'name':
        Alert.alert('Display name', `Current name: ${displayName}`, [{ text: 'OK' }]);
        break;
      case 'notifications':
        Alert.alert('Notifications', 'Push notifications will be available in a future update.', [{ text: 'OK' }]);
        break;
      case 'privacy':
        Alert.alert('Privacy', 'DEEPER answers are private until reveal and discarded after the game ends.', [{ text: 'OK' }]);
        break;
      case 'terms':
        Alert.alert('Terms', 'This is source code, not a hosted service. There are no terms of service; the repository is published under the MIT License.', [{ text: 'OK' }]);
        break;
      case 'delete':
        Alert.alert(
          'Delete local data',
          'This clears your local identity, free game count and premium state from this device.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  await AsyncStorage.removeItem('deeper.identity');
                  await logoutPremium();
                  await resetFreeGames();
                  await reloadIdentity();
                  await refreshAccount();
                  Alert.alert('Deleted', 'Local data has been cleared.');
                })();
              },
            },
          ]
        );
        break;
      case 'about':
        Alert.alert('DEEPER', 'Better questions. Better conversations.\n\nVersion 0.1.0', [{ text: 'OK' }]);
        break;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.back}>{'<  Home'}</Text>
      </Pressable>

      <Text style={styles.eyebrow}>YOUR PROFILE</Text>
      <Text style={styles.name}>{displayName}</Text>

      {/* Premium card */}
      {premium ? (
        <View style={[styles.premiumCard, { backgroundColor: '#12332A', borderColor: '#1F5C48' }]}>
          <Text style={[styles.premiumEyebrow, { color: theme.green }]}>DEEPER+</Text>
          <Text style={styles.premiumTitle}>You're a member.</Text>
          <Text style={styles.premiumBody}>
            Unlimited hosting, no ads, and every conversation pack.
          </Text>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.premiumCard, pressed && { opacity: 0.92 }]}
          onPress={() => router.push('/paywall')}
        >
          <Text style={styles.premiumEyebrow}>DEEPER+</Text>
          <Text style={styles.premiumTitle}>Go deeper.</Text>
          <Text style={styles.premiumBody}>
            Unlimited hosting, no ads, and every conversation pack.
          </Text>
          <View style={styles.premiumButton}>
            <Text style={styles.premiumButtonText}>See plans</Text>
          </View>
        </Pressable>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{premium ? '∞' : freeGames}</Text>
          <Text style={styles.statLabel}>{premium ? 'unlimited hosting' : 'free games left'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{'♡'}</Text>
          <Text style={styles.statLabel}>local & private</Text>
        </View>
      </View>

      {/* List */}
      <View style={styles.list}>
        {MENU_ITEMS.map((item) => (
          <Pressable
            key={item.action}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={({ pressed }) => [styles.listItem, pressed && { backgroundColor: '#1C1C26' }]}
            onPress={() => handleItem(item.action)}
          >
            <Text style={[styles.listText, item.destructive && { color: theme.danger }]}>{item.label}</Text>
            <Text style={[styles.listArrow, item.destructive && { color: theme.danger }]}>{'>'}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: theme.bg, padding: theme.spacing.xxl },
  back: { color: theme.muted, fontSize: 15, marginBottom: theme.spacing.xxxl, paddingVertical: 8 },
  eyebrow: { color: theme.pink, fontSize: 11, fontWeight: '900', letterSpacing: 1.7 },
  name: {
    color: theme.text, fontSize: 36, fontWeight: '800',
    marginTop: theme.spacing.md, marginBottom: theme.spacing.lg,
  },

  premiumCard: {
    backgroundColor: '#1C1530', borderRadius: theme.radius.xl,
    padding: theme.spacing.xxl, borderWidth: 1, borderColor: '#3A2660',
  },
  premiumEyebrow: { color: theme.purple, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  premiumTitle: { color: theme.text, fontSize: 25, fontWeight: '800', marginTop: theme.spacing.sm },
  premiumBody: { color: '#B8A8D0', lineHeight: 21, fontSize: 14, marginTop: 4 },
  premiumButton: {
    backgroundColor: theme.purple, borderRadius: 12, alignSelf: 'flex-start',
    paddingVertical: 12, paddingHorizontal: 16, marginTop: 18,
  },
  premiumButtonText: { color: theme.text, fontWeight: '800', fontSize: 13 },

  statsRow: {
    backgroundColor: theme.card, borderRadius: theme.radius.lg,
    flexDirection: 'row', justifyContent: 'space-around', padding: 20,
    marginTop: theme.spacing.lg, borderWidth: 1, borderColor: theme.border,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: theme.text, fontSize: 28, fontWeight: '900' },
  statLabel: { color: theme.muted, fontSize: 11, marginTop: 4 },
  statDivider: { width: 1, backgroundColor: theme.border, marginVertical: 4 },

  list: { marginTop: 18, gap: 2 },
  listItem: {
    backgroundColor: theme.surface, padding: 17, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  listText: { color: theme.text, fontSize: 15 },
  listArrow: { color: theme.muted, fontSize: 18 },
});
