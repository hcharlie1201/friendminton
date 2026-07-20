import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GatheringSocialTag } from '../../features/gatherings/gatheringDraft';
import { colors, fonts } from '../ui';
import { GatheringFormSection } from './GatheringFormPrimitives';

const socialTagOptions: Array<{ label: string; value: GatheringSocialTag }> = [
  { label: 'Drinks', value: 'drinks' },
  { label: 'Food', value: 'food' },
  { label: 'Board games', value: 'board_games' },
  { label: 'Watch party', value: 'watch_party' },
  { label: 'Gear swap', value: 'gear_swap' },
];

export function GatheringSocialDetails({
  onToggleTag,
  selectedTags,
}: {
  onToggleTag: (tag: GatheringSocialTag) => void;
  selectedTags: GatheringSocialTag[];
}) {
  return (
    <GatheringFormSection
      icon="sparkles-outline"
      subtitle="Make the off-court plan easy to understand at a glance."
      title="Social vibe"
    >
      <View style={styles.tagWrap}>
        {socialTagOptions.map((tag) => (
          <SocialTagChoice
            key={tag.value}
            onToggle={onToggleTag}
            selected={selectedTags.includes(tag.value)}
            tag={tag}
          />
        ))}
      </View>
    </GatheringFormSection>
  );
}

function SocialTagChoice({
  onToggle,
  selected,
  tag,
}: {
  onToggle: (value: GatheringSocialTag) => void;
  selected: boolean;
  tag: (typeof socialTagOptions)[number];
}) {
  const toggle = useSocialTagAction(onToggle, tag.value);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={toggle}
      style={[styles.tag, selected && styles.tagSelected]}
    >
      <MaterialCommunityIcons
        color={selected ? '#FFFFFF' : colors.primaryDark}
        name={socialTagIcon(tag.value)}
        size={17}
      />
      <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag.label}</Text>
    </Pressable>
  );
}

function useSocialTagAction(onToggle: (value: GatheringSocialTag) => void, value: GatheringSocialTag) {
  return useCallback(() => onToggle(value), [onToggle, value]);
}

function socialTagIcon(value: GatheringSocialTag): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (value) {
    case 'drinks':
      return 'glass-cocktail';
    case 'board_games':
      return 'dice-multiple-outline';
    case 'watch_party':
      return 'television-play';
    case 'gear_swap':
      return 'swap-horizontal-bold';
    default:
      return 'food-fork-drink';
  }
}

const styles = StyleSheet.create({
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#B9D8FF',
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  tagSelected: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  tagText: { color: colors.primaryDark, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  tagTextSelected: { color: '#FFFFFF' },
});
