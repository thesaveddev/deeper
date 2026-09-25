import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { countdownSequence } from '@/src/lib/animations';
import { theme } from '@/src/lib/theme';

interface Props {
  onDone: () => void;
}

export function RevealCountdown({ onDone }: Props) {
  const v1 = useRef(new Animated.Value(0)).current;
  const v2 = useRef(new Animated.Value(0)).current;
  const v3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    countdownSequence([v1, v2, v3], onDone);
  }, []);

  return (
    <View style={styles.overlay}>
      <View style={styles.row}>
        <Animated.View style={[styles.numWrap, { opacity: v1, transform: [{ scale: v1 }] }]}>
          <Text style={styles.num}>3</Text>
        </Animated.View>
        <Animated.View style={[styles.numWrap, { opacity: v2, transform: [{ scale: v2 }] }]}>
          <Text style={styles.num}>2</Text>
        </Animated.View>
        <Animated.View style={[styles.numWrap, { opacity: v3, transform: [{ scale: v3 }] }]}>
          <Text style={styles.num}>1</Text>
        </Animated.View>
      </View>
      <Text style={styles.hint}>Revealing answers...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13,13,18,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  row: { flexDirection: 'row', gap: 32, alignItems: 'center' },
  numWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  num: { color: theme.pink, fontSize: 64, fontWeight: '900' },
  hint: { color: theme.muted, fontSize: 14, marginTop: 24 },
});
