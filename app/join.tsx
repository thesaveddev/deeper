import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/src/lib/game-store';
import { theme } from '@/src/lib/theme';

export default function JoinScreen() {
  const { joinRoom, error, identity } = useGame();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  // Pre-fill name from saved identity
  useEffect(() => {
    if (identity?.displayName && identity.displayName !== 'You') {
      setName(identity.displayName);
    }
  }, [identity]);

  useEffect(() => {
    if (params.code) setCode(params.code.toUpperCase());
  }, [params.code]);
  const valid = code.length === 4 && name.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.back}>‹  Home</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>JOIN A ROOM</Text>
        <Text style={styles.title}>
          Someone wants to go{'\n'}a little deeper.
        </Text>
        <Text style={styles.subtitle}>
          Enter the four-letter code they shared with you.
        </Text>

        <Text style={styles.label}>ROOM CODE</Text>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={4}
          value={code}
          onChangeText={(value) =>
            setCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
          }
          placeholder="K7XM"
          placeholderTextColor={theme.placeholder}
          style={styles.codeInput}
          accessibilityLabel="Room code"
        />

        <Text style={styles.label}>YOUR NAME</Text>
        <TextInput
          maxLength={32}
          value={name}
          onChangeText={setName}
          placeholder="How should we call you?"
          placeholderTextColor={theme.placeholder}
          style={styles.input}
          accessibilityLabel="Display name"
        />
        {!name.trim() && code.length === 4 && (
          <Text style={styles.hint}>Enter your name to join</Text>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={!valid}
          style={({ pressed }) => [
            styles.button,
            !valid && styles.buttonDisabled,
            pressed && valid && { opacity: 0.88 },
          ]}
          onPress={() => {
            joinRoom(code, name);
            router.push('/game');
          }}
        >
          <Text style={styles.buttonText}>Join conversation  →</Text>
        </Pressable>

        <Text style={styles.helpText}>
          Wrong code? Ask the host to double-check the four letters in their lobby.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: theme.spacing.xxl },
  back: { color: theme.muted, fontSize: 15, paddingVertical: 8 },
  content: { flex: 1, paddingTop: theme.spacing.xxxl },
  eyebrow: { color: theme.pink, fontSize: 11, letterSpacing: 1.8, fontWeight: '900' },
  title: {
    color: theme.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginTop: theme.spacing.md,
  },
  subtitle: {
    color: theme.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xxxl,
  },
  label: {
    color: theme.muted,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '800',
    marginBottom: 9,
    marginTop: 18,
  },
  codeInput: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    color: theme.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 10,
    padding: 18,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  input: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    color: theme.text,
    fontSize: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: theme.border,
  },
  button: {
    backgroundColor: theme.pink,
    borderRadius: theme.radius.lg,
    padding: 18,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: theme.text, fontSize: 16, fontWeight: '800' },
  errorCard: {
    backgroundColor: theme.dangerBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#55252E',
    padding: 14,
    marginTop: 18,
  },
  errorText: { color: theme.danger, fontSize: 13, lineHeight: 19 },
  hint: {
    color: theme.amber,
    fontSize: 12,
    marginTop: 6,
  },
  helpText: {
    color: theme.faint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
  },
});
