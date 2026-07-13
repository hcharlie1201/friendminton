import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

type Props = TextInputProps & {
  variant?: 'default' | 'compact';
};

export function TextField({ placeholderTextColor = '#7B8794', style, variant = 'default', ...props }: Props) {
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
    backgroundColor: '#FFFFFF',
    borderColor: '#D6DDE6',
    borderRadius: 8,
    borderWidth: 1,
    color: '#101820',
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  compact: {
    fontSize: 15,
    minHeight: 46,
  },
});
