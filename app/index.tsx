import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/src/lib/game-store';
import { theme } from '@/src/lib/theme';

export default function HomeScreen() {
  const { identity, freeGames, premium, refreshAccount } = useGame();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);
  const initial = (identity?.displayName ?? 'You').trim().charAt(0).toUpperCase() || 'Y';

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <Text style={styles.wordmark}>DEEPER</Text>
          <Text style={styles.tagline}>Better questions.{'\n'}Better conversations.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/profile')}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>
      </View>

      {/* Today's Question */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.todayCard, pressed && { opacity: 0.9 }]}
        onPress={() => router.push('/daily')}
      >
        <View style={styles.cardTopLine}>
          <Text style={styles.eyebrow}>TODAY'S QUESTION</Text>
          <Text style={styles.heart}>♥</Text>
        </View>
        <Text style={styles.question}>
          What's something you wish people understood about you?
        </Text>
        <Text style={styles.ghostButtonText}>Answer privately →</Text>
      </Pressable>

      {/* Create / Join */}
      <Text style={styles.sectionTitle}>Start a conversation</Text>
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.actionCard,
            { backgroundColor: theme.pink },
            pressed && { opacity: 0.88 },
          ]}
          onPress={() => router.push('/create')}
        >
          <Text style={styles.actionIcon}>＋</Text>
          <View>
            <Text style={styles.actionTitle}>Create a room</Text>
            <Text style={styles.actionCaption}>Invite your people</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.actionCard,
            { backgroundColor: theme.purple },
            pressed && { opacity: 0.88 },
          ]}
          onPress={() => router.push('/join')}
        >
          <Text style={styles.actionIcon}>↗</Text>
          <View>
            <Text style={styles.actionTitle}>Join a room</Text>
            <Text style={styles.actionCaption}>Enter a room code</Text>
          </View>
        </Pressable>
      </View>

      {/* Credits */}
      <View style={styles.creditRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.creditTitle}>{premium ? 'DEEPER+ active' : 'Free games remaining'}</Text>
          <Text style={styles.creditSubtext}>
            {premium ? 'Unlimited hosting. No ads.' : 'Host generously. Come back often.'}
          </Text>
        </View>
        <View style={[styles.creditBadge, premium && { borderColor: theme.purple, backgroundColor: '#1C1530' }]}>
          <Text style={[styles.creditCount, premium && { color: theme.purple, fontSize: 22 }]}>
            {premium ? '∞' : freeGames}
          </Text>
        </View>
      </View>

      {/* Discover */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.discoverCard,
          pressed && { opacity: 0.9 },
        ]}
        onPress={() => router.push('/discover')}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DISCOVER</Text>
          <Text style={styles.discoverTitle}>Find your kind of deep.</Text>
          <Text style={styles.discoverSubtext}>Explore decks made for every mood.</Text>
        </View>
        <Text style={styles.discoverArrow}>→</Text>
      </Pressable>

      {/* Premium CTA */}
      {premium ? (
        <View style={[styles.premiumCard, { backgroundColor: '#12332A', borderColor: '#1F5C48' }]}>
          <Text style={[styles.premiumEyebrow, { color: theme.green }]}>DEEPER+</Text>
          <Text style={styles.premiumTitle}>You're a member.</Text>
          <Text style={[styles.premiumSub, { color: '#8FD8C0' }]}>
            Unlimited hosting · No ads · Premium packs
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.premiumCard,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => router.push('/paywall')}
        >
          <Text style={styles.premiumEyebrow}>GO DEEPER</Text>
          <Text style={styles.premiumTitle}>Unlock unlimited conversations</Text>
          <Text style={styles.premiumSub}>Unlimited hosting · No ads · Premium packs</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacing.xxl,
    backgroundColor: theme.bg,
    gap: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brand: { flex: 1 },
  wordmark: {
    color: theme.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 6,
  },
  tagline: {
    color: theme.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },

  /* Today's question */
  todayCard: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    color: theme.pink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  heart: { color: theme.pink, fontSize: 22 },
  question: {
    color: theme.text,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: theme.spacing.lg,
  },
  ghostButtonText: {
    color: theme.blue,
    fontSize: 15,
    fontWeight: '700',
    marginTop: theme.spacing.md,
  },

  /* Section title */
  sectionTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: theme.spacing.xs,
  },

  /* Action cards */
  actionRow: { flexDirection: 'row', gap: theme.spacing.md },
  actionCard: {
    flex: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xxl,
    minHeight: 150,
    justifyContent: 'space-between',
  },
  actionIcon: { color: theme.text, fontSize: 30, fontWeight: '300' },
  actionTitle: { color: theme.text, fontSize: 17, fontWeight: '800' },
  actionCaption: { color: '#FCE8EE', fontSize: 12, marginTop: 4 },

  /* Credits */
  creditRow: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
  },
  creditTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  creditSubtext: { color: theme.muted, fontSize: 12, marginTop: 4 },
  creditBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing.lg,
  },
  creditCount: { color: theme.text, fontSize: 24, fontWeight: '900' },

  /* Discover */
  discoverCard: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xxl,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: '#2B334C',
    flexDirection: 'row',
    alignItems: 'center',
  },
  discoverTitle: {
    color: theme.text,
    fontSize: 19,
    fontWeight: '800',
    marginTop: theme.spacing.sm,
  },
  discoverSubtext: { color: theme.muted, fontSize: 13, marginTop: 4 },
  discoverArrow: { color: theme.blue, fontSize: 26, paddingLeft: theme.spacing.lg },

  /* Premium */
  premiumCard: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xxl,
    backgroundColor: '#231845',
    borderWidth: 1,
    borderColor: '#4A3080',
    marginBottom: theme.spacing.xxl,
  },
  premiumEyebrow: {
    color: theme.purple,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  premiumTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: theme.spacing.sm,
  },
  premiumSub: { color: '#B8A8D0', fontSize: 13, marginTop: 4 },
});
