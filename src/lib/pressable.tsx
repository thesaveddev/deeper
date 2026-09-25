import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';

interface ThemedPressableProps {
  children: ReactNode;
  style?: ViewStyle | ((pressed: boolean) => ViewStyle);
  disabled?: boolean;
  onPress?: () => void;
}

export function ThemedPressable({ children, style, disabled, onPress }: ThemedPressableProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => {
        const base = typeof style === 'function' ? style(pressed) : (style ?? {});
        return [base, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }];
      }}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}
