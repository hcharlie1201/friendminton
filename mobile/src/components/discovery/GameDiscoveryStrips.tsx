import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import {
  gameDateOptions,
  type GameDateFilter,
  type GameQuickFilter,
} from '../../features/gatherings/gameDiscovery';
import { colors, fonts } from '../ui';

type DateProps = {
  onChange: (value: GameDateFilter) => void;
  value: GameDateFilter;
};

type QuickProps = {
  onChange: (value: GameQuickFilter) => void;
  value: GameQuickFilter;
};

const quickOptions: Array<{ label: string; value: GameQuickFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Open plays', value: 'open_play' },
  { label: 'Private', value: 'private' },
  { label: 'Round robins', value: 'round_robin' },
];

export function GameDateStrip({ onChange, value }: DateProps) {
  const options = useMemo(gameDateOptions, []);
  return (
    <ScrollView horizontal contentContainerStyle={styles.strip} showsHorizontalScrollIndicator={false}>
      {options.map((option) => (
        <DateOption key={option.value} onChange={onChange} option={option} selected={value === option.value} />
      ))}
    </ScrollView>
  );
}

export function GameQuickFilterStrip({ onChange, value }: QuickProps) {
  return (
    <ScrollView horizontal contentContainerStyle={styles.strip} showsHorizontalScrollIndicator={false}>
      {quickOptions.map((option) => (
        <QuickOption key={option.value} onChange={onChange} option={option} selected={value === option.value} />
      ))}
    </ScrollView>
  );
}

function DateOption({ onChange, option, selected }: {
  onChange: DateProps['onChange'];
  option: ReturnType<typeof gameDateOptions>[number];
  selected: boolean;
}) {
  const select = useDateSelection(onChange, option.value);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={select} style={[styles.dateChip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{option.label}</Text>
    </Pressable>
  );
}

function QuickOption({ onChange, option, selected }: {
  onChange: QuickProps['onChange'];
  option: (typeof quickOptions)[number];
  selected: boolean;
}) {
  const select = useQuickSelection(onChange, option.value);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={select} style={[styles.quickChip, selected && styles.quickChipSelected]}>
      <Text style={[styles.quickLabel, selected && styles.quickLabelSelected]}>{option.label}</Text>
    </Pressable>
  );
}

function useDateSelection(onChange: DateProps['onChange'], value: GameDateFilter) {
  return useCallback(() => onChange(value), [onChange, value]);
}

function useQuickSelection(onChange: QuickProps['onChange'], value: GameQuickFilter) {
  return useCallback(() => onChange(value), [onChange, value]);
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingRight: 4 },
  dateChip: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  chipLabel: { color: colors.ink, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' },
  chipLabelSelected: { color: '#FFFFFF', fontFamily: fonts.black, fontWeight: '900' },
  quickChip: { backgroundColor: colors.primarySoft, borderRadius: 10, justifyContent: 'center', minHeight: 38, paddingHorizontal: 14 },
  quickChipSelected: { backgroundColor: colors.primary },
  quickLabel: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' },
  quickLabelSelected: { color: '#FFFFFF', fontFamily: fonts.black, fontWeight: '900' },
});
