import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  children: ReactNode;
  emptyText?: string;
  itemCount: number;
  title: string;
};

export function Section({ children, emptyText, itemCount, title }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{itemCount}</Text>
      </View>
      {itemCount === 0 && emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#101820',
    fontSize: 20,
    fontWeight: '900',
  },
  count: {
    backgroundColor: '#DCE8E2',
    borderRadius: 14,
    color: '#143D33',
    fontSize: 13,
    fontWeight: '900',
    minWidth: 28,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  empty: {
    color: '#637083',
    fontSize: 15,
    fontWeight: '700',
  },
});
