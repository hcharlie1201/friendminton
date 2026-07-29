import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, textSizes, textWeights } from '../ui';
import { DiscoveryFilterSheet } from './DiscoveryFilterSheet';
import type { DiscoveryPreferences, SkillLevel } from './types';

type Props = DiscoveryPreferences & {
  onApply: (preferences: DiscoveryPreferences) => void;
};

export const DiscoveryFilters = memo(function DiscoveryFilters({
  city,
  latitude,
  locationEnabled,
  longitude,
  onApply,
  skillLevel,
}: Props) {
  const filterSheet = useFilterSheetActions(onApply);

  return (
    <>
      <View style={styles.summary}>
        <View style={styles.locationSummary}>
          <Text style={styles.eyebrow}>DISCOVER NEAR</Text>
          <View style={styles.locationRow}>
            <Ionicons color={colors.primary} name="location" size={19} />
            <Text numberOfLines={1} style={styles.locationText}>
              {locationEnabled ? city : 'Anywhere'}
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
          <Ionicons color={colors.primaryStrong} name="options-outline" size={22} />
          <Text style={styles.filterLabel}>Filters</Text>
          {skillLevel && <View style={styles.activeDot} />}
        </Pressable>
      </View>

      <DiscoveryFilterSheet
        city={city}
        latitude={latitude}
        locationEnabled={locationEnabled}
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
    backgroundColor: colors.surface,
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
    ...textSizes.caption,
    ...textWeights.strong,
    color: colors.textMuted,
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  locationText: {
    ...textSizes.large,
    ...textWeights.heavy,
    color: colors.text,
    flex: 1,
  },
  preferenceText: {
    ...textSizes.small,
    ...textWeights.regular,
    color: colors.textMuted,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  filterLabel: {
    ...textSizes.small,
    ...textWeights.heavy,
    color: colors.primaryStrong,
  },
  activeDot: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
});
