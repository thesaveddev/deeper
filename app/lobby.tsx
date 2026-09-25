import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ExpoClipboard from 'expo-clipboard';
import { useGame } from '@/src/lib/game-store';
import { PulseDot } from '@/src/lib/pulse';
import { theme } from '@/src/lib/theme';

export default function LobbyScreen() {
  const params = useLocalSearchParams<{ categoryId?: string; title?: string; name?: string; maxPlayers?: string }>();
  const { snapshot, createRoom, startGame, leaveRoom, error, identity, isHost, connection, freeGames, premium } = useGame();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!snapshot && params.categoryId) {
      createRoom(params.categoryId, params.name, params.maxPlayers ? parseInt(params.maxPlayers, 10) : undefined);
    }
  }, [params.categoryId]);

  // Navigate to game when game starts
  useEffect(() => {
    if (snapshot?.status === 'active' || snapshot?.status === 'complete' || snapshot?.status === 'ended') {
      router.replace('/game');
    }
  }, [snapshot?.status]);

  const share = async () => {
    if (!snapshot) return;
    await Share.share({
      message: `Join my DEEPER conversation ❤️\n\nRoom code: ${snapshot.roomCode}\n\nOpen deeper://join/${snapshot.roomCode}`,
    });
  };

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!snapshot) return;
    await ExpoClipboard.setStringAsync(snapshot.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exit = () => {
    leaveRoom();
    router.dismissAll();
    router.replace('/');
  };

  /* ─── Loading / connecting ─── */
  if (!snapshot) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.pink} />
        <Text style={styles.loadingTitle}>
          {connection === 'disconnected' ? 'Cannot reach the server' : 'Setting up your room…'}
        </Text>
        <Text style={styles.loadingSub}>
          {connection === 'disconnected'
            ? 'Check that the server is running and EXPO_PUBLIC_SOCKET_URL in .env uses your computer IP (not localhost).'
            : 'Warming up a fresh conversation for you.'}
        </Text>
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]} onPress={exit}>
          <Text style={styles.secondaryText}>Back home</Text>
        </Pressable>
      </View>
    );
  }

  const canStart = snapshot.players.length >= 2;
  const needsUpgrade = isHost && !premium && freeGames <= 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={exit}>
          <Text style={styles.back}>‹  Leave</Text>
        </Pressable>
        <View style={styles.statusPill}>
          <PulseDot color={connection === 'connected' ? theme.green : theme.pink} />
          <Text style={styles.statusText}>
            {connection === 'connected' ? 'Live' : 'Reconnecting…'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>YOUR ROOM IS READY</Text>
        <Text style={styles.title}>{params.title ?? 'A DEEPER conversation'}</Text>

        {/* Room code card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>ROOM CODE</Text>
          <Text style={styles.code}>{snapshot.roomCode}</Text>
          <Text style={styles.hint}>Share this with your people</Text>
          <View style={styles.codeActions}>
            <Pressable
              style={({ pressed }) => [styles.primarySmall, pressed && { opacity: 0.85 }]}
              onPress={share}
            >
              <Text style={styles.primarySmallText}>Share invite</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondarySmall, pressed && { opacity: 0.8 }]}
              onPress={copy}
            >
              <Text style={styles.secondarySmallText}>{copied ? 'Copied!' : 'Copy code'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Players */}
        <Text style={styles.sectionTitle}>
          In the room · {snapshot.players.length}/{snapshot.maxPlayers}
        </Text>
        <View style={styles.players}>
          {snapshot.players.map((player) => {
            const mine = player.playerId === identity?.playerId || player.displayName === identity?.displayName;
            return (
              <View style={styles.player} key={player.playerId}>
                <View style={styles.playerDot} />
                <Text style={styles.playerName}>
                  {player.displayName}{mine ? '  (you)' : ''}
                </Text>
                {player.isHost && <Text style={styles.hostBadge}>HOST</Text>}
              </View>
            );
          })}
        </View>

        {/* Waiting hint */}
        <View style={styles.waitingCard}>
          {canStart ? (
            <>
              <Text style={styles.waitingTitle}>Everyone is here ✨</Text>
              <Text style={styles.waitingSub}>Ready when you are.</Text>
            </>
          ) : (
            <>
              <Text style={styles.waitingTitle}>Waiting for one more person…</Text>
              <Text style={styles.waitingSub}>
                Share the code above. The room fills up instantly once they join.
              </Text>
            </>
          )}
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Start button */}
      {isHost && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {needsUpgrade ? (
            <>
              <Text style={styles.creditNote}>No free games left — guests still join for free.</Text>
              <Pressable
                style={({ pressed }) => [styles.startButton, { backgroundColor: theme.purple }, pressed && { opacity: 0.88 }]}
                onPress={() => router.push('/paywall')}
              >
                <Text style={styles.startText}>Get DEEPER+ to host  →</Text>
              </Pressable>
            </>
          ) : (
            <>
              {!premium && <Text style={styles.creditNote}>Free games remaining: {freeGames}</Text>}
              <Pressable
                disabled={!canStart}
                style={({ pressed }) => [
                  styles.startButton,
                  !canStart && styles.startButtonDisabled,
                  pressed && canStart && { opacity: 0.88 },
                ]}
                onPress={startGame}
              >
                <Text style={styles.startText}>Start conversation  →</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTitle: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  loadingSub: { color: theme.muted, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center', maxWidth: 280 },
  secondaryButton: { marginTop: 28, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14, backgroundColor: theme.card },
  secondaryText: { color: theme.text, fontWeight: '700' },
  errorCard: {
    backgroundColor: theme.dangerBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#55252E',
    padding: 14,
    marginTop: 16,
  },
  errorText: { color: theme.danger, fontSize: 13, lineHeight: 19 },

  /* Top bar */
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.xxl },
  back: { color: theme.muted, fontSize: 15, paddingVertical: 8 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: theme.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statusText: { color: theme.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  /* Scroll content */
  scroll: { flexGrow: 1, padding: theme.spacing.xxl, paddingBottom: 140 },
  eyebrow: { color: theme.pink, fontSize: 11, letterSpacing: 1.8, fontWeight: '900' },
  title: { color: theme.text, fontSize: 30, fontWeight: '800', marginTop: 10, letterSpacing: -0.5 },

  /* Code card */
  codeCard: {
    marginTop: 24,
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  codeLabel: { color: theme.muted, fontSize: 11, letterSpacing: 1.8, fontWeight: '800' },
  code: { color: theme.text, fontSize: 54, letterSpacing: 10, fontWeight: '900', marginVertical: 10 },
  hint: { color: theme.muted, fontSize: 13 },
  codeActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  primarySmall: { borderRadius: 14, backgroundColor: theme.pink, paddingVertical: 12, paddingHorizontal: 18 },
  primarySmallText: { color: theme.text, fontWeight: '800', fontSize: 13 },
  secondarySmall: { borderRadius: 14, backgroundColor: theme.cardAlt, paddingVertical: 12, paddingHorizontal: 18 },
  secondarySmallText: { color: theme.text, fontWeight: '700', fontSize: 13 },

  /* Players */
  sectionTitle: { color: theme.text, fontSize: 19, fontWeight: '800', marginTop: 32, marginBottom: 14 },
  players: { gap: 10 },
  player: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  playerDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.green, marginRight: 12 },
  playerName: { color: theme.text, fontWeight: '700', flex: 1 },
  hostBadge: { color: theme.pink, fontSize: 10, letterSpacing: 1, fontWeight: '900' },

  /* Waiting */
  waitingCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1F1F2B',
  },
  waitingTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  waitingSub: { color: theme.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },

  /* Footer */
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing.xxl,
    paddingTop: 12,
    backgroundColor: 'rgba(13,13,18,0.96)',
    gap: 8,
  },
  creditNote: { color: theme.muted, fontSize: 12, textAlign: 'center' },
  startButton: { backgroundColor: theme.pink, padding: 18, borderRadius: theme.radius.lg, alignItems: 'center' },
  startButtonDisabled: { opacity: 0.35 },
  startText: { color: theme.text, fontSize: 16, fontWeight: '800' },
});
