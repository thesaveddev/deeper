import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categories } from '@deeper/content';
import { theme } from '@/src/lib/theme';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.back}>‹  Home</Text>
      </Pressable>

      <Text style={styles.eyebrow}>DISCOVER</Text>
      <Text style={styles.title}>Find your kind{'\n'}of deep.</Text>
      <Text style={styles.subtitle}>Every deck opens a different door.</Text>

      {categories.map((category, index) => {
        const isEven = index % 2 === 0;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.card,
              { borderColor: isEven ? '#3A2331' : '#292343' },
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() =>
              router.push({ pathname: '/lobby', params: { categoryId: category.id, title: category.title } })
            }
          >
            <Text style={[styles.icon, { color: isEven ? theme.pink : theme.purple }]}>
              {category.icon}
            </Text>
            <View style={styles.info}>
              <Text style={styles.cardTitle}>{category.title}</Text>
              <Text style={styles.cardDescription}>{category.description}</Text>
              <Text style={styles.count}>
                {category.isPremium ? 'DEEPER+ · 100 questions' : 'FREE · 100 questions'}
              </Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: theme.bg,
    padding: theme.spacing.xxl,
  },
  back: { color: theme.muted, fontSize: 15, marginBottom: theme.spacing.xxxl, paddingVertical: 8 },
  eyebrow: { color: theme.pink, fontSize: 11, letterSpacing: 1.7, fontWeight: '900' },
  title: {
    color: theme.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginTop: theme.spacing.md,
  },
  subtitle: { color: theme.muted, fontSize: 15, marginTop: theme.spacing.sm, marginBottom: 28 },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  icon: { fontSize: 28, width: 44 },
  info: { flex: 1, marginLeft: 9 },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  cardDescription: { color: theme.muted, fontSize: 12, marginTop: 4 },
  count: { color: theme.faint, fontSize: 10, fontWeight: '800', marginTop: 10, letterSpacing: 0.5 },
  arrow: { color: theme.muted, fontSize: 20, paddingLeft: theme.spacing.md },
});
