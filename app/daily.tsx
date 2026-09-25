import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { getStreak, markDailyComplete, hasCompletedToday } from '@/src/lib/streak';
import { trackDailyQuestionStarted, trackDailyQuestionCompleted } from '@/src/lib/analytics';

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const [answer, setAnswer] = useState('');
  const [saved, setSaved] = useState(false);
  const [streak, setStreak] = useState(0);
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    void getStreak().then((s) => setStreak(s.count));
    void hasCompletedToday().then((done) => setAlreadyDone(done));
    trackDailyQuestionStarted();
  }, []);

  const handleSave = async () => {
    const s = await markDailyComplete();
    setStreak(s.count);
    setSaved(true);
    trackDailyQuestionCompleted(s.count);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.back}>{'<  Home'}</Text>
      </Pressable>

      {/* Streak badge */}
      {streak > 0 && (
        <View style={styles.streakBadge}>
          <Text style={styles.streakIcon}>🔥</Text>
          <Text style={styles.streakCount}>{streak}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      )}

      <Text style={styles.eyebrow}>TODAY'S QUESTION ♥</Text>
      <Text style={styles.title}>
        What's something you wish people understood about you?
      </Text>

      {saved || alreadyDone ? (
        <View style={styles.savedCard}>
          <View style={styles.savedIconWrap}>
            <Text style={styles.savedIcon}>✓</Text>
          </View>
          <Text style={styles.savedTitle}>
            {alreadyDone && !saved ? 'Already completed today.' : 'Saved privately.'}
          </Text>
          <Text style={styles.savedBody}>
            {alreadyDone && !saved
              ? 'Come back tomorrow to keep your streak going.'
              : 'This stays on your device. Share it only if you choose.'}
          </Text>
          {streak >= 3 && (
            <View style={styles.streakCard}>
              <Text style={styles.streakCardText}>
                {streak >= 30 ? 'Incredible! 30+ day streak!' : streak >= 7 ? 'Amazing! A full week!' : 'Keep it going!'}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <>
          <TextInput
            multiline
            value={answer}
            onChangeText={setAnswer}
            placeholder="Write a little, or a lot..."
            placeholderTextColor={theme.placeholder}
            style={styles.input}
          />
          <Pressable
            disabled={!answer.trim()}
            style={({ pressed }) => [
              styles.button,
              !answer.trim() && styles.buttonDisabled,
              pressed && answer.trim() && { opacity: 0.88 },
            ]}
            onPress={handleSave}
          >
            <Text style={styles.buttonText}>Save answer</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
        onPress={() => router.push('/create')}
      >
        <Text style={styles.secondaryText}>Start a room around this  →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: theme.spacing.xxl },
  back: { color: theme.muted, fontSize: 15, marginBottom: theme.spacing.lg, paddingVertical: 8 },

  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2A1A10', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'flex-start', marginBottom: theme.spacing.lg, borderWidth: 1, borderColor: '#4A3020',
  },
  streakIcon: { fontSize: 16 },
  streakCount: { color: theme.amber, fontSize: 16, fontWeight: '900' },
  streakLabel: { color: '#CC9944', fontSize: 12, fontWeight: '700' },

  eyebrow: { color: theme.pink, fontSize: 11, letterSpacing: 1.7, fontWeight: '900' },
  title: {
    color: theme.text, fontSize: 30, lineHeight: 37, fontWeight: '800',
    marginTop: theme.spacing.md, marginBottom: 28,
  },
  input: {
    minHeight: 180, backgroundColor: theme.card, borderRadius: theme.radius.xl,
    padding: 18, color: theme.text, fontSize: 17, lineHeight: 25,
    textAlignVertical: 'top', borderWidth: 1, borderColor: theme.border,
  },
  button: {
    backgroundColor: theme.pink, padding: 18, borderRadius: theme.radius.lg,
    alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: theme.text, fontWeight: '800', fontSize: 16 },
  secondaryButton: { alignItems: 'center', marginTop: 24 },
  secondaryText: { color: theme.purple, fontWeight: '700', fontSize: 15 },

  savedCard: {
    backgroundColor: theme.card, padding: 28, borderRadius: theme.radius.xl,
    alignItems: 'center', borderWidth: 1, borderColor: theme.border,
  },
  savedIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(99,230,190,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  savedIcon: { color: theme.green, fontSize: 28, fontWeight: '800' },
  savedTitle: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 14 },
  savedBody: { color: theme.muted, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  streakCard: {
    backgroundColor: 'rgba(255,179,64,0.1)', borderRadius: 12, padding: 12, marginTop: 16,
    borderWidth: 1, borderColor: 'rgba(255,179,64,0.2)',
  },
  streakCardText: { color: theme.amber, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
