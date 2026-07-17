import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { colors } from './theme';
import { fonts } from './typography';

type Props = TextInputProps & {
  variant?: 'default' | 'compact';
};

export function TextField({ placeholderTextColor = colors.muted, style, variant = 'default', ...props }: Props) {
  return (
    <TextInput
      placeholderTextColor={placeholderTextColor}
      style={[styles.input, variant === 'compact' && styles.compact, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  compact: {
    borderColor: 'transparent',
    fontSize: 15,
    minHeight: 46,
  },
});
