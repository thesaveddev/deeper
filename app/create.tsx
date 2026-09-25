import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categories } from '@deeper/content';
import { theme } from '@/src/lib/theme';

export default function CreateRoomScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.back}>‹  Home</Text>
      </Pressable>

      <Text style={styles.eyebrow}>CREATE A ROOM</Text>
      <Text style={styles.title}>
        What kind of conversation{'\n'}are you in the mood for?
      </Text>
      <Text style={styles.subtitle}>
        Choose a deck. You can always come back for another.
      </Text>

      <Text style={styles.label}>YOUR NAME</Text>
      <TextInput
        maxLength={32}
        value={name}
        onChangeText={setName}
        placeholder="How should we call you?"
        placeholderTextColor={theme.placeholder}
        style={styles.nameInput}
        accessibilityLabel="Display name"
      />

      <View style={styles.grid}>
        {categories.map((category, index) => {
          const isEven = index % 2 === 0;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${category.title}`}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: isEven ? '#3A2331' : '#292343',
                  backgroundColor: isEven ? '#1A1218' : '#16121E',
                },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() =>
                router.push({
                  pathname: '/lobby',
                  params: { categoryId: category.id, title: category.title, name: name.trim() || undefined, maxPlayers: String(category.maxPlayers) },
                })
              }
            >
              <View style={styles.cardHeader}>
                <Text
                  style={[
                    styles.icon,
                    { color: isEven ? theme.pink : theme.purple },
                  ]}
                >
                  {category.icon}
                </Text>
                {category.isPremium && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumText}>DEEPER+</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardTitle}>{category.title}</Text>
              <Text style={styles.cardDescription}>{category.description}</Text>
              <Text style={styles.playerLimit}>{category.minPlayers === category.maxPlayers ? `${category.maxPlayers} players` : `${category.minPlayers}-${category.maxPlayers} players`}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: theme.bg,
    padding: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  back: { color: theme.muted, fontSize: 15, marginBottom: theme.spacing.md, paddingVertical: 8 },
  eyebrow: { color: theme.pink, fontSize: 11, letterSpacing: 1.8, fontWeight: '900' },
  title: {
    color: theme.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.7,
    marginTop: theme.spacing.sm,
  },
  subtitle: {
    color: theme.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  label: {
    color: theme.muted,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '800',
    marginBottom: 9,
    marginTop: 8,
  },
  nameInput: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    color: theme.text,
    fontSize: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: theme.spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xxxl,
  },
  card: {
    width: '48%',
    minHeight: 175,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  icon: { fontSize: 28 },
  premiumBadge: {
    backgroundColor: 'rgba(155,92,255,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  premiumText: { color: '#D4B8FF', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  cardTitle: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    marginTop: theme.spacing.lg,
  },
  cardDescription: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: theme.spacing.sm,
  },
  playerLimit: {
    color: theme.faint,
    fontSize: 10,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
    letterSpacing: 0.3,
  },
});
