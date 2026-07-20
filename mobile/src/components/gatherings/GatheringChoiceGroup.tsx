import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';

export type GatheringChoiceOption<T extends string> = {
  description?: string;
  label: string;
  value: T;
};

type Props<T extends string> = {
  onChange: (value: T) => void;
  options: GatheringChoiceOption<T>[];
  value: T;
};

export function GatheringChoiceGroup<T extends string>({ onChange, options, value }: Props<T>) {
  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {options.map((option) => (
        <GatheringChoice
          key={option.value}
          onSelect={onChange}
          option={option}
          selected={option.value === value}
        />
      ))}
    </View>
  );
}

function GatheringChoice<T extends string>({
  onSelect,
  option,
  selected,
}: {
  onSelect: (value: T) => void;
  option: GatheringChoiceOption<T>;
  selected: boolean;
}) {
  const select = useChoiceAction(onSelect, option.value);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={select}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
      {option.description && (
        <Text style={[styles.description, selected && styles.descriptionSelected]}>{option.description}</Text>
      )}
    </Pressable>
  );
}

function useChoiceAction<T extends string>(onSelect: (value: T) => void, value: T) {
  return useCallback(() => {
    onSelect(value);
  }, [onSelect, value]);
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: '30%',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  choiceSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  label: { color: colors.ink, fontFamily: fonts.black, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  labelSelected: { color: '#FFFFFF' },
  description: { color: colors.muted, fontFamily: fonts.medium, fontSize: 10, lineHeight: 14, marginTop: 3, textAlign: 'center' },
  descriptionSelected: { color: 'rgba(255,255,255,0.8)' },
});
