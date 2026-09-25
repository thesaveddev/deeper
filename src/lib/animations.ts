import { AccessibilityInfo, Animated, Easing } from 'react-native';

let reducedMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((v) => { reducedMotion = v; });

export function shouldAnimate(): boolean {
  return !reducedMotion;
}

/** Fade + slide up entrance */
export function fadeInUp(value: Animated.Value, delay = 0, duration = 400): Animated.CompositeAnimation {
  if (!reducedMotion) {
    value.setValue(0);
    return Animated.parallel([
      Animated.timing(value, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
  }
  value.setValue(1);
  return Animated.delay(0);
}

/** Scale pop-in (for cards, buttons) */
export function scaleIn(value: Animated.Value, delay = 0, duration = 300): Animated.CompositeAnimation {
  if (!reducedMotion) {
    value.setValue(0);
    return Animated.spring(value, { toValue: 1, delay, friction: 8, tension: 40, useNativeDriver: true });
  }
  value.setValue(1);
  return Animated.delay(0);
}

/** Stagger multiple items */
export function staggerAnimations(
  values: Animated.Value[],
  animation: (v: Animated.Value, delay: number) => Animated.CompositeAnimation,
  staggerMs = 80,
): Animated.CompositeAnimation {
  if (!reducedMotion) {
    return Animated.parallel(values.map((v, i) => animation(v, i * staggerMs)));
  }
  values.forEach((v) => v.setValue(1));
  return Animated.delay(0);
}

/** Countdown sequence (3, 2, 1) */
export function countdownSequence(
  values: [Animated.Value, Animated.Value, Animated.Value],
  onDone: () => void,
): void {
  if (reducedMotion) {
    onDone();
    return;
  }
  const pulse = (v: Animated.Value) =>
    Animated.sequence([
      Animated.parallel([
        Animated.timing(v, { toValue: 1.2, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(400),
    ]);
  Animated.sequence([
    pulse(values[0]),
    pulse(values[1]),
    pulse(values[2]),
  ]).start(() => onDone());
}

/** Looping pulse (for waiting states) */
export function createPulseLoop(value: Animated.Value, min = 0.4, max = 1, duration = 900): Animated.CompositeAnimation {
  if (reducedMotion) {
    value.setValue(1);
    return Animated.delay(0);
  }
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue: max, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(value, { toValue: min, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])
  );
}
