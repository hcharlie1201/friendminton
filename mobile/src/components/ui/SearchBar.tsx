import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors } from './theme';
import { fonts } from './typography';

type Props = {
  autoFocus?: boolean;
  isLoading?: boolean;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
  value: string;
};

export function SearchBar({ autoFocus = false, isLoading = false, onChangeText, onClear, onClose, value }: Props) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityLabel="Close search" accessibilityRole="button" hitSlop={10} onPress={onClose}>
        <Ionicons color={colors.text} name="arrow-back" size={27} />
      </Pressable>
      <View style={styles.field}>
        <Ionicons color={colors.textMuted} name="search" size={20} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          clearButtonMode="never"
          maxLength={80}
          onChangeText={onChangeText}
          placeholder="Search players"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          style={styles.input}
          value={value}
        />
        <View style={styles.accessory}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            value.length > 0 && (
              <Pressable accessibilityLabel="Clear search" accessibilityRole="button" hitSlop={8} onPress={onClear}>
                <Ionicons color={colors.textMuted} name="close-circle" size={21} />
              </Pressable>
            )
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    minWidth: 0,
    paddingVertical: 0,
  },
  accessory: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
});
