import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DiscoverSection } from '../../features/gatherings/gameDiscovery';
import { colors, fonts } from '../ui';

type Props = {
  onChange: (section: DiscoverSection) => void;
  value: DiscoverSection;
};

const sections: Array<{ label: string; value: DiscoverSection }> = [
  { label: 'Explore', value: 'explore' },
  { label: 'Find games', value: 'games' },
];

export function DiscoverSectionPicker({ onChange, value }: Props) {
  return (
    <View accessibilityRole="tablist" style={styles.container}>
      {sections.map((section) => (
        <DiscoverSectionOption
          key={section.value}
          label={section.label}
          onChange={onChange}
          selected={section.value === value}
          value={section.value}
        />
      ))}
    </View>
  );
}

function DiscoverSectionOption({
  label,
  onChange,
  selected,
  value,
}: {
  label: string;
  onChange: Props['onChange'];
  selected: boolean;
  value: DiscoverSection;
}) {
  const select = useSectionSelection(onChange, value);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={select}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

function useSectionSelection(onChange: Props['onChange'], value: DiscoverSection) {
  return useCallback(() => onChange(value), [onChange, value]);
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E8EEF7',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  option: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: colors.card,
    shadowColor: '#0F172A',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 5,
  },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' },
  labelSelected: { color: colors.ink, fontFamily: fonts.black, fontWeight: '900' },
});
