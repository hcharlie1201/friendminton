import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';

export type DiscoveryResultType = 'games' | 'courts';

type Props = {
  onChange: (value: DiscoveryResultType) => void;
  value: DiscoveryResultType;
};

const options: Array<{ label: string; value: DiscoveryResultType }> = [
  { label: 'Games', value: 'games' },
  { label: 'Courts', value: 'courts' },
];

export function DiscoveryResultTabs({ onChange, value }: Props) {
  return (
    <View accessibilityRole="tablist" style={styles.container}>
      {options.map((option) => (
        <ResultTab key={option.value} onChange={onChange} option={option} selected={value === option.value} />
      ))}
    </View>
  );
}

function ResultTab({ onChange, option, selected }: {
  onChange: Props['onChange'];
  option: (typeof options)[number];
  selected: boolean;
}) {
  const select = useResultTabSelection(onChange, option.value);
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={select} style={[styles.tab, selected && styles.tabSelected]}>
      <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
    </Pressable>
  );
}

function useResultTabSelection(onChange: Props['onChange'], value: DiscoveryResultType) {
  return useCallback(() => onChange(value), [onChange, value]);
}

const styles = StyleSheet.create({
  container: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 4, padding: 4 },
  tab: { alignItems: 'center', borderRadius: 9, flex: 1, justifyContent: 'center', minHeight: 42 },
  tabSelected: { backgroundColor: colors.primary },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' },
  labelSelected: { color: '#FFFFFF', fontFamily: fonts.black, fontWeight: '900' },
});
