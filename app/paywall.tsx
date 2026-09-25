import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { PLANS, purchasePlan, restorePurchases, type PremiumPlan } from '@/src/lib/premium';
import { useGame } from '@/src/lib/game-store';
import { trackPaywallViewed, trackSubscriptionStarted } from '@/src/lib/analytics';

const BENEFITS = [
  { icon: '∞', text: 'Unlimited hosting' },
  { icon: '🚫', text: 'No advertisements' },
  { icon: '🔒', text: 'All premium conversation packs' },
  { icon: '🎮', text: 'Future premium game modes' },
  { icon: '✨', text: 'New packs as they release' },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { refreshAccount } = useGame();
  const [selected, setSelected] = useState<string>(PLANS.find((p) => p.recommended)?.id ?? PLANS[1]?.id ?? 'yearly');

  useEffect(() => { trackPaywallViewed(); }, []);
  const [purchasing, setPurchasing] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [restored, setRestored] = useState(false);

  const handlePurchase = async () => {
    setPurchasing(true);
    const ok = await purchasePlan(selected);
    setPurchasing(false);
    if (ok) {
      await refreshAccount();
      setPurchased(true);
      trackSubscriptionStarted(selected);
    }
  };

  const handleRestore = async () => {
    const ok = await restorePurchases();
    await refreshAccount();
    setRestored(ok);
  };

  if (purchased) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successTitle}>Welcome to DEEPER+</Text>
        <Text style={styles.successSub}>
          Unlimited hosting, no ads, and every premium pack is now yours.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.88 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>Start exploring</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.back}>{'<  Maybe later'}</Text>
      </Pressable>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>GO DEEPER</Text>
        <Text style={styles.heroTitle}>Unlock unlimited{'\n'}conversations</Text>
        <Text style={styles.heroSub}>
          Host as many games as you want, with no ads and every premium pack included.
        </Text>
      </View>

      {/* Benefits */}
      <View style={styles.benefitsCard}>
        {BENEFITS.map((b, i) => (
          <View style={styles.benefit} key={i}>
            <Text style={styles.benefitIcon}>{b.icon}</Text>
            <Text style={styles.benefitText}>{b.text}</Text>
          </View>
        ))}
      </View>

      {/* Plans */}
      <Text style={styles.sectionTitle}>Choose your plan</Text>
      <View style={styles.plans}>
        {PLANS.map((plan) => {
          const isSelected = selected === plan.id;
          return (
            <Pressable
              key={plan.id}
              accessibilityRole="button"
              accessibilityLabel={`${plan.name} plan, ${plan.price} ${plan.period}`}
              style={({ pressed }) => [
                styles.planCard,
                isSelected && styles.planCardSelected,
                pressed && { opacity: 0.92 },
              ]}
              onPress={() => setSelected(plan.id)}
            >
              <View style={styles.planHeader}>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.planName, isSelected && styles.planNameSelected]}>{plan.name}</Text>
                {plan.recommended && (
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedText}>BEST VALUE</Text>
                  </View>
                )}
              </View>
              <View style={styles.planPrice}>
                <Text style={[styles.price, isSelected && styles.priceSelected]}>{plan.price}</Text>
                <Text style={styles.period}>{plan.period}</Text>
              </View>
              {plan.savings && (
                <Text style={styles.savings}>{plan.savings}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Purchase button */}
      <Pressable
        disabled={purchasing}
        style={({ pressed }) => [
          styles.primaryButton,
          purchasing && { opacity: 0.6 },
          pressed && !purchasing && { opacity: 0.88 },
        ]}
        onPress={handlePurchase}
      >
        {purchasing ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <Text style={styles.primaryButtonText}>
            Subscribe with {PLANS.find((p) => p.id === selected)?.price ?? ''}
          </Text>
        )}
      </Pressable>

      {/* Guest reassurance */}
      <View style={styles.guestNote}>
        <Text style={styles.guestIcon}>♡</Text>
        <Text style={styles.guestText}>
          Guests can always join for free.{'\n'}DEEPER+ is only for hosts.
        </Text>
      </View>

      {/* Footer links */}
      <View style={styles.footer}>
        <Pressable onPress={handleRestore}>
          <Text style={styles.footerLink}>
            {restored ? 'Purchases restored ✓' : 'Restore purchases'}
          </Text>
        </Pressable>
        <Pressable onPress={() => {}}>
          <Text style={styles.footerLink}>Terms</Text>
        </Pressable>
        <Pressable onPress={() => {}}>
          <Text style={styles.footerLink}>Privacy</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: theme.bg, padding: theme.spacing.xxl },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  back: { color: theme.muted, fontSize: 15, paddingVertical: 8, marginBottom: theme.spacing.lg },

  /* Hero */
  hero: { marginBottom: theme.spacing.xxl },
  heroEyebrow: { color: theme.purple, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  heroTitle: {
    color: theme.text, fontSize: 32, lineHeight: 38, fontWeight: '800',
    marginTop: theme.spacing.sm, letterSpacing: -0.5,
  },
  heroSub: { color: theme.muted, fontSize: 15, lineHeight: 22, marginTop: theme.spacing.md },

  /* Benefits */
  benefitsCard: {
    backgroundColor: theme.card, borderRadius: theme.radius.xl, padding: theme.spacing.xxl,
    borderWidth: 1, borderColor: theme.border, gap: 16, marginBottom: theme.spacing.xxl,
  },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  benefitText: { color: theme.text, fontSize: 15, fontWeight: '600', flex: 1 },

  /* Plans */
  sectionTitle: { color: theme.text, fontSize: 19, fontWeight: '800', marginBottom: 14 },
  plans: { gap: 10, marginBottom: theme.spacing.xxl },
  planCard: {
    backgroundColor: theme.card, borderRadius: theme.radius.lg, padding: 18,
    borderWidth: 2, borderColor: theme.border,
  },
  planCardSelected: { borderColor: theme.purple, backgroundColor: '#1C1530' },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: theme.purple },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.purple },
  planName: { color: theme.muted, fontSize: 15, fontWeight: '700', flex: 1 },
  planNameSelected: { color: theme.text },
  recommendedBadge: {
    backgroundColor: 'rgba(155,92,255,0.15)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  recommendedText: { color: '#D4B8FF', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  planPrice: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 10 },
  price: { color: theme.muted, fontSize: 22, fontWeight: '800' },
  priceSelected: { color: theme.text },
  period: { color: theme.faint, fontSize: 13 },
  savings: { color: theme.green, fontSize: 11, fontWeight: '700', marginTop: 6 },

  /* Purchase */
  primaryButton: {
    backgroundColor: theme.purple, padding: 18, borderRadius: 17, alignItems: 'center',
  },
  primaryButtonText: { color: theme.text, fontSize: 16, fontWeight: '800' },

  /* Guest note */
  guestNote: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: theme.spacing.xxl,
    backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  guestIcon: { fontSize: 22 },
  guestText: { color: theme.muted, fontSize: 13, lineHeight: 19, flex: 1 },

  /* Footer */
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: theme.spacing.xxl },
  footerLink: { color: theme.faint, fontSize: 12 },

  /* Success */
  successIcon: { color: theme.green, fontSize: 56 },
  successTitle: { color: theme.text, fontSize: 28, fontWeight: '800', marginTop: 20 },
  successSub: { color: theme.muted, fontSize: 15, marginTop: 8, textAlign: 'center', maxWidth: 280 },
});
