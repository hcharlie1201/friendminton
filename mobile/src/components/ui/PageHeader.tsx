import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

type Props = {
  action?: ReactNode;
  eyebrow: string;
  title: string;
};

export function PageHeader({ action, eyebrow, title }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 35,
  },
});
