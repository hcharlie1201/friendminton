import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

export function Button({ children, disabled = false, loading = false, onPress, variant = 'primary' }: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : '#263238'} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#143D33',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: '#C9C2B3',
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  disabled: {
    opacity: 0.72,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryLabel: {
    color: '#263238',
    fontSize: 13,
  },
});
