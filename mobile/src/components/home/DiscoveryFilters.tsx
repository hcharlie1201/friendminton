import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';
import { DiscoveryFilterSheet } from './DiscoveryFilterSheet';
import type { DiscoveryPreferences, SkillLevel } from './types';

type Props = DiscoveryPreferences & {
  onApply: (preferences: DiscoveryPreferences) => void;
};

export const DiscoveryFilters = memo(function DiscoveryFilters({ city, latitude, longitude, onApply, skillLevel }: Props) {
  const filterSheet = useFilterSheetActions(onApply);

  return (
    <>
      <View style={styles.summary}>
        <View style={styles.locationSummary}>
          <Text style={styles.eyebrow}>DISCOVER NEAR</Text>
          <View style={styles.locationRow}>
            <Ionicons color={colors.primary} name="location" size={19} />
            <Text numberOfLines={1} style={styles.locationText}>
              {city}
            </Text>
          </View>
          <Text style={styles.preferenceText}>{levelLabel(skillLevel)}</Text>
        </View>
        <Pressable
          accessibilityHint="Change the location and playing level used for discovery"
          accessibilityLabel="Open discovery filters"
          accessibilityRole="button"
          onPress={filterSheet.open}
          style={styles.filterButton}
        >
          <Ionicons color={colors.primaryDark} name="options-outline" size={22} />
          <Text style={styles.filterLabel}>Filters</Text>
          {skillLevel && <View style={styles.activeDot} />}
        </Pressable>
      </View>

      <DiscoveryFilterSheet
        city={city}
        latitude={latitude}
        longitude={longitude}
        onApply={filterSheet.apply}
        onClose={filterSheet.close}
        skillLevel={skillLevel}
        visible={filterSheet.isOpen}
      />
    </>
  );
});

function useFilterSheetActions(onApply: Props['onApply']) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const apply = useCallback(
    (preferences: DiscoveryPreferences) => {
      onApply(preferences);
      setIsOpen(false);
    },
    [onApply],
  );

  return { apply, close, isOpen, open };
}

function levelLabel(skillLevel: SkillLevel | null) {
  if (!skillLevel) return 'Any playing level';
  return `${skillLevel[0].toUpperCase()}${skillLevel.slice(1)} players`;
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -20,
    marginTop: -16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  locationSummary: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  eyebrow: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  locationText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.black,
    fontSize: 20,
    fontWeight: '900',
  },
  preferenceText: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#B9D8FF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  filterLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.black,
    fontSize: 14,
    fontWeight: '900',
  },
  activeDot: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
});
