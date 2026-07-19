import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';
import type { SkillLevel } from './types';

type LevelOption = {
  description: string;
  label: string;
  value: SkillLevel | null;
};

const levelOptions: LevelOption[] = [
  { description: 'Show players at every stage', label: 'Any level', value: null },
  { description: 'Learning technique and building consistency', label: 'Beginner', value: 'beginner' },
  { description: 'Comfortable rallies and regular match play', label: 'Intermediate', value: 'intermediate' },
  { description: 'Fast-paced games with consistent control', label: 'Advanced', value: 'advanced' },
  { description: 'Tournament-focused and high intensity', label: 'Competitive', value: 'competitive' },
];

export const SkillLevelPicker = memo(function SkillLevelPicker({
  onChange,
  value,
}: {
  onChange: (value: SkillLevel | null) => void;
  value: SkillLevel | null;
}) {
  return (
    <View accessibilityLabel="Playing level" accessibilityRole="radiogroup" style={styles.list}>
      {levelOptions.map((option) => (
        <LevelRow
          isSelected={value === option.value}
          key={option.label}
          onSelect={onChange}
          option={option}
        />
      ))}
    </View>
  );
});

const LevelRow = memo(function LevelRow({
  isSelected,
  onSelect,
  option,
}: {
  isSelected: boolean;
  onSelect: (value: SkillLevel | null) => void;
  option: LevelOption;
}) {
  const select = useLevelSelection(option.value, onSelect);

  return (
    <Pressable
      accessibilityHint={option.description}
      accessibilityLabel={option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      onPress={select}
      style={styles.row}
    >
      <View style={styles.copy}>
        <Text style={styles.label}>{option.label}</Text>
        <Text style={styles.description}>{option.description}</Text>
      </View>
      <View style={[styles.radio, isSelected && styles.radioSelected]}>
        {isSelected && <View style={styles.radioCenter} />}
      </View>
    </Pressable>
  );
});

function useLevelSelection(value: SkillLevel | null, onSelect: (value: SkillLevel | null) => void) {
  return useCallback(() => onSelect(value), [onSelect, value]);
}

const styles = StyleSheet.create({
  list: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  radio: {
    alignItems: 'center',
    borderColor: '#94A3B8',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioCenter: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
});
