import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function PillButton({ children, active = false, disabled = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && styles.active,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, active && styles.activeLabel]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6DDE6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  active: {
    borderColor: '#143D33',
    backgroundColor: '#143D33',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: '#263238',
    fontSize: 14,
    fontWeight: '700',
  },
  activeLabel: {
    color: '#FFFFFF',
  },
});
