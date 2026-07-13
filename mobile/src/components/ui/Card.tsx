import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E5EA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
});
