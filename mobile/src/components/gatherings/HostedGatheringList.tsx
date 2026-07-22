import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native';

import type { Gathering } from '../../api/generated';
import {
  formatGatheringSchedule,
  formatGatheringVenue,
  gatheringTimingLabel,
  gatheringTimingStatus,
  type GatheringTimingStatus,
} from '../../features/gatherings/gatheringPresentation';
import { Button, colors, fonts } from '../ui';

type Props = {
  gatherings: readonly Gathering[];
  onCreateGathering: () => void;
  onOpenGathering: (gatheringId: string) => void;
};

export function HostedGatheringList({ gatherings, onCreateGathering, onOpenGathering }: Props) {
  const groups = groupHostedGatherings(gatherings);

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>Hosted by you</Text>
          <Text style={styles.subtitle}>Manage the sessions and socials you created.</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{gatherings.length}</Text>
        </View>
      </View>

      {gatherings.length > 0 ? (
        <View style={styles.groups}>
          <HostedGatheringGroup
            description="Open the gathering when you’re done to finish your session."
            gatherings={groups.ongoing}
            onOpenGathering={onOpenGathering}
            status="ongoing"
            title="Happening now"
          />
          <HostedGatheringGroup
            gatherings={groups.upcoming}
            onOpenGathering={onOpenGathering}
            status="upcoming"
            title="Coming up"
          />
          <HostedGatheringGroup
            description="Review the gathering, finish your activity, or revisit its post."
            gatherings={groups.ended}
            onOpenGathering={onOpenGathering}
            status="ended"
            title="Past gatherings"
          />
        </View>
      ) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons color={colors.primary} name="badminton" size={34} />
          <Text style={styles.emptyTitle}>You haven’t hosted anything yet</Text>
          <Text style={styles.emptyBody}>Create an open play, reserved-court session, or badminton social.</Text>
        </View>
      )}

      {gatherings.length === 0 && (
        <Button icon="add-circle" onPress={onCreateGathering}>
          Host a session or social
        </Button>
      )}
    </View>
  );
}

function HostedGatheringGroup({
  description,
  gatherings,
  onOpenGathering,
  status,
  title,
}: {
  description?: string;
  gatherings: readonly Gathering[];
  onOpenGathering: (gatheringId: string) => void;
  status: GatheringTimingStatus;
  title: string;
}) {
  if (gatherings.length === 0) return null;

  return (
    <View style={styles.group}>
      <View style={styles.groupHeading}>
        <View style={styles.groupTitleRow}>
          <Text accessibilityRole="header" style={styles.groupTitle}>{title}</Text>
          <View style={styles.groupCountBadge}>
            <Text style={styles.groupCountText}>{gatherings.length}</Text>
          </View>
        </View>
        {description && <Text style={styles.groupDescription}>{description}</Text>}
      </View>
      <View style={styles.list}>
        {gatherings.map((gathering) => (
          <HostedGatheringRow
            gathering={gathering}
            key={gathering.id}
            onOpenGathering={onOpenGathering}
            status={status}
          />
        ))}
      </View>
    </View>
  );
}

function HostedGatheringRow({
  gathering,
  onOpenGathering,
  status,
}: {
  gathering: Gathering;
  onOpenGathering: (gatheringId: string) => void;
  status: GatheringTimingStatus;
}) {
  const open = useHostedGatheringAction(gathering.id, onOpenGathering);
  const date = gatheringDateTile(gathering.starts_at);
  const statusLabel = gatheringTimingLabel(status);

  return (
    <Pressable
      accessibilityHint="Opens gathering details"
      accessibilityLabel={`${gathering.title}. ${statusLabel}. ${formatGatheringSchedule(gathering.starts_at, gathering.ends_at)}`}
      accessibilityRole="button"
      onPress={open}
      style={hostedGatheringRowStyle}
    >
      <View style={[styles.dateTile, status === 'ended' && styles.dateTileEnded]}>
        <Text style={[styles.dateMonth, status === 'ended' && styles.dateMonthEnded]}>{date.month}</Text>
        <Text style={styles.dateDay}>{date.day}</Text>
      </View>
      <View style={styles.eventCopy}>
        <GatheringStatusBadge status={status} />
        <Text numberOfLines={1} style={styles.eventTitle}>{gathering.title}</Text>
        <Text numberOfLines={1} style={styles.eventSchedule}>
          {formatGatheringSchedule(gathering.starts_at, gathering.ends_at)}
        </Text>
        <Text numberOfLines={1} style={styles.eventVenue}>
          {formatGatheringVenue(gathering.venue, gathering.city)}
        </Text>
      </View>
      <View style={styles.eventMeta}>
        <Ionicons
          color={colors.textMuted}
          name={gathering.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
          size={16}
        />
        <Ionicons color={colors.primaryStrong} name="chevron-forward" size={21} />
      </View>
    </Pressable>
  );
}

function GatheringStatusBadge({ status }: { status: GatheringTimingStatus }) {
  return (
    <View
      style={[
        styles.statusBadge,
        status === 'ongoing' && styles.statusBadgeOngoing,
        status === 'ended' && styles.statusBadgeEnded,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          status === 'ongoing' && styles.statusDotOngoing,
          status === 'ended' && styles.statusDotEnded,
        ]}
      />
      <Text
        style={[
          styles.statusText,
          status === 'ongoing' && styles.statusTextOngoing,
          status === 'ended' && styles.statusTextEnded,
        ]}
      >
        {gatheringTimingLabel(status)}
      </Text>
    </View>
  );
}

function useHostedGatheringAction(
  gatheringId: string,
  onOpenGathering: (gatheringId: string) => void,
) {
  return useCallback(() => {
    onOpenGathering(gatheringId);
  }, [gatheringId, onOpenGathering]);
}

function hostedGatheringRowStyle({ pressed }: PressableStateCallbackType) {
  return [styles.row, pressed && styles.rowPressed];
}

function gatheringDateTile(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return { day: '—', month: 'SOON' };
  return {
    day: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date).toUpperCase(),
  };
}

function groupHostedGatherings(gatherings: readonly Gathering[]) {
  const groups: Record<GatheringTimingStatus, Gathering[]> = {
    ended: [],
    ongoing: [],
    upcoming: [],
  };
  const now = new Date();

  for (const gathering of gatherings) {
    groups[gatheringTimingStatus(gathering.starts_at, gathering.ends_at, now)].push(gathering);
  }

  groups.ongoing.sort(compareStartDescending);
  groups.upcoming.sort(compareStartAscending);
  groups.ended.sort(compareStartDescending);
  return groups;
}

function compareStartAscending(left: Gathering, right: Gathering) {
  return gatheringStartTimestamp(left) - gatheringStartTimestamp(right);
}

function compareStartDescending(left: Gathering, right: Gathering) {
  return gatheringStartTimestamp(right) - gatheringStartTimestamp(left);
}

function gatheringStartTimestamp(gathering: Gathering) {
  const timestamp = new Date(gathering.starts_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 18,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  headingCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 21, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  countBadge: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 99,
    justifyContent: 'center',
    minWidth: 30,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  countText: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  groups: { gap: 24 },
  group: { gap: 8 },
  groupHeading: { gap: 3 },
  groupTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  groupTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 15, fontWeight: '900' },
  groupCountBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 99,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  groupCountText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, fontWeight: '700' },
  groupDescription: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  list: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 94,
    paddingVertical: 13,
  },
  rowPressed: { backgroundColor: colors.primarySurface },
  dateTile: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 62,
    width: 56,
  },
  dateTileEnded: { backgroundColor: colors.surfaceMuted },
  dateMonth: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  dateMonthEnded: { color: colors.textMuted },
  dateDay: { color: colors.text, fontFamily: fonts.black, fontSize: 23, fontWeight: '900', lineHeight: 26 },
  eventCopy: { flex: 1, gap: 2, minWidth: 0 },
  statusBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySurface,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusBadgeOngoing: { backgroundColor: colors.liveSurface },
  statusBadgeEnded: { backgroundColor: colors.surfaceMuted },
  statusDot: { backgroundColor: colors.primary, borderRadius: 99, height: 5, width: 5 },
  statusDotOngoing: { backgroundColor: colors.live },
  statusDotEnded: { backgroundColor: colors.textSubtle },
  statusText: { color: colors.primaryStrong, fontFamily: fonts.bold, fontSize: 9, fontWeight: '700' },
  statusTextOngoing: { color: colors.liveStrong },
  statusTextEnded: { color: colors.textMuted },
  eventTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 15, fontWeight: '900' },
  eventSchedule: { color: colors.primaryStrong, fontFamily: fonts.bold, fontSize: 11, fontWeight: '700' },
  eventVenue: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11 },
  eventMeta: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12 },
  emptyTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
