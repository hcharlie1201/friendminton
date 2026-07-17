import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from './ui';

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
      <View style={[styles.dot, active && styles.activeDot]} />
      <Text style={[styles.label, active && styles.activeLabel]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: '#B9D8FF',
    borderRadius: 999,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
    shadowColor: colors.primary,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 13,
    elevation: 3,
  },
  active: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ translateY: 1 }, { scale: 0.98 }],
  },
  dot: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    width: 12,
  },
  activeDot: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  label: {
    color: colors.primaryDark,
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  activeLabel: {
    color: '#FFFFFF',
  },
});
