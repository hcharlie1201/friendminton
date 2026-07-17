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
  const iconColor = isPrimary ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.primaryDark;

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
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : colors.primaryDark} />
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
    borderColor: colors.primaryDark,
    borderWidth: 1,
    shadowColor: colors.primary,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 3,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
    borderColor: '#B9D8FF',
    borderWidth: 1,
  },
  quiet: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: '#FFF1F2',
    borderColor: '#F8B4B8',
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
    backgroundColor: colors.primaryDark,
    shadowOpacity: 0.12,
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  secondaryPressed: {
    backgroundColor: '#D9EAFF',
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  quietPressed: {
    backgroundColor: colors.primarySoft,
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  dangerPressed: {
    backgroundColor: '#FFE4E6',
    transform: [{ translateY: 1 }, { scale: 0.99 }],
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 15,
    fontWeight: '900',
  },
  primaryLabel: {
    color: '#FFFFFF',
  },
  secondaryLabel: {
    color: colors.primaryDark,
  },
  quietLabel: {
    color: colors.primaryDark,
  },
  dangerLabel: {
    color: colors.danger,
  },
  compactLabel: {
    fontSize: 13,
  },
});
