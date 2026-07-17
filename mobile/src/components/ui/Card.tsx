import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from './theme';

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
});
