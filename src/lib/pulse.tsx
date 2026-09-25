import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

interface PulseDotProps {
  color?: string;
  size?: number;
}

export function PulseDot({ color = '#FF3B6B', size = 8 }: PulseDotProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    });
    return () => { cancelled = true; };
  }, [opacity]);

  return (
    <Animated.View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}
