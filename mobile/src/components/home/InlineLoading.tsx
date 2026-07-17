import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';

export function InlineLoading({ label }: { label: string }) {
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 36,
  },
  label: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
});
