import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { shouldAnimate } from '@/src/lib/animations';
import { theme } from '@/src/lib/theme';

interface Bubble {
  id: string;
  emoji: string;
  x: number;
}

interface Props {
  reactions: Bubble[];
  onComplete: (id: string) => void;
}

const EMOJI_MAP: Record<string, string> = {
  love: '♥',
  funny: '☻',
  unexpected: '◉',
  more: '◌',
};

function BubbleItem({ reaction, onComplete }: { reaction: Bubble; onComplete: (id: string) => void }) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!shouldAnimate()) {
      onComplete(reaction.id);
      return;
    }
    Animated.parallel([
      Animated.timing(y, { toValue: -120, duration: 1200, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start(() => onComplete(reaction.id));
  }, []);

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: reaction.x,
          transform: [{ translateY: y }],
          opacity,
        },
      ]}
      accessible={false}
    >
      <Text style={styles.emoji}>{EMOJI_MAP[reaction.emoji] ?? reaction.emoji}</Text>
    </Animated.View>
  );
}

export function ReactionBubbles({ reactions, onComplete }: Props) {
  return (
    <View style={styles.container} pointerEvents="none">
      {reactions.map((r) => (
        <BubbleItem key={r.id} reaction={r} onComplete={onComplete} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 50,
  },
  bubble: {
    position: 'absolute',
    bottom: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,59,107,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
});
