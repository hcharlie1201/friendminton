import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { BadmintonGroup, Gathering } from '../../api/generated';
import { GatheringDiscoveryCard } from '../gatherings';
import { colors, fonts } from '../ui';

type Props = {
  gatherings: readonly Gathering[];
  groups: readonly BadmintonGroup[];
  onOpenGathering: (gatheringId: string) => void;
};

export function GroupEventsPanel({ gatherings, groups, onOpenGathering }: Props) {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const events = gatherings.filter(hasGroup);

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>Upcoming group events</Text>
          <Text style={styles.subtitle}>Sessions and socials hosted by badminton groups near you.</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{events.length}</Text>
        </View>
      </View>

      {events.length > 0 ? events.map((gathering) => (
        <View key={gathering.id} style={styles.event}>
          <View style={styles.groupLabel}>
            <MaterialCommunityIcons color={colors.primaryStrong} name="account-group-outline" size={17} />
            <Text numberOfLines={1} style={styles.groupName}>
              {groupNames.get(gathering.group_id) ?? 'Badminton group'}
            </Text>
            {gathering.join_policy === 'members_only' && (
              <View style={styles.requestBadge}>
                <Text style={styles.requestText}>Group access</Text>
              </View>
            )}
          </View>
          <GatheringDiscoveryCard gathering={gathering} onOpenGathering={onOpenGathering} />
        </View>
      )) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons color={colors.socialAccentStrong} name="calendar-heart" size={34} />
          <Text style={styles.emptyTitle}>No upcoming group events</Text>
          <Text style={styles.emptyBody}>Events published by groups will appear here.</Text>
        </View>
      )}
    </View>
  );
}

function hasGroup(gathering: Gathering): gathering is Gathering & { group_id: string } {
  return typeof gathering.group_id === 'string' && gathering.group_id.length > 0;
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.background, gap: 16, paddingHorizontal: 20, paddingBottom: 30, paddingTop: 22 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  headingCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 21, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  countBadge: {
    alignItems: 'center',
    backgroundColor: colors.socialAccentSurface,
    borderRadius: 99,
    justifyContent: 'center',
    minWidth: 30,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  countText: { color: colors.socialAccentStrong, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  event: { gap: 8 },
  groupLabel: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 3 },
  groupName: { color: colors.primaryStrong, flex: 1, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  requestBadge: { backgroundColor: colors.energyAccentSurface, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  requestText: { color: colors.energyAccentStrong, fontFamily: fonts.black, fontSize: 9, fontWeight: '900' },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 6,
    padding: 24,
  },
  emptyTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' },
  emptyBody: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
});
