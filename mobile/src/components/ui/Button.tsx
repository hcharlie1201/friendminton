import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';
import { fonts } from './typography';

type Props = {
  children: ReactNode;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  onPress: () => void;
  size?: 'default' | 'compact';
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
};

export function Button({
  children,
  disabled = false,
  icon,
  loading = false,
  onPress,
  size = 'default',
  variant = 'primary',
}: Props) {
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';
  const iconColor = isPrimary ? colors.textOnPrimary : variant === 'danger' ? colors.danger : colors.primaryStrong;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        size === 'compact' && styles.compact,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles[`${variant}Pressed`],
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.textOnPrimary : colors.primaryStrong} />
      ) : (
        <View style={styles.content}>
          {icon && <Ionicons color={iconColor} name={icon} size={size === 'compact' ? 16 : 18} />}
          <Text style={[styles.label, styles[`${variant}Label`], size === 'compact' && styles.compactLabel]}>
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryStrong,
    borderWidth: 1,
    shadowColor: colors.primary,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 3,
  },
  secondary: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  quiet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
  },
  compact: {
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  disabled: {
    opacity: 0.58,
  },
  primaryPressed: {
    backgroundColor: colors.primaryPressed,
    shadowOpacity: 0.12,
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  secondaryPressed: {
    backgroundColor: colors.primarySurfacePressed,
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  quietPressed: {
    backgroundColor: colors.primarySurface,
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  dangerPressed: {
    backgroundColor: colors.dangerSurface,
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    color: colors.textInverse,
    fontFamily: fonts.black,
    fontSize: 15,
    fontWeight: '900',
  },
  primaryLabel: {
    color: colors.textOnPrimary,
  },
  secondaryLabel: {
    color: colors.primaryStrong,
  },
  quietLabel: {
    color: colors.primaryStrong,
  },
  dangerLabel: {
    color: colors.danger,
  },
  compactLabel: {
    fontSize: 13,
  },
});
