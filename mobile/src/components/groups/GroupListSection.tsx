import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native';

import type { BadmintonGroup, GroupGoal } from '../../api/generated';
import { colors, fonts } from '../ui';

type Props = {
  emptyBody: string;
  emptyTitle: string;
  groups: readonly BadmintonGroup[];
  onOpenGroup: (groupId: string) => void;
  subtitle: string;
  title: string;
};

export function GroupListSection({
  emptyBody,
  emptyTitle,
  groups,
  onOpenGroup,
  subtitle,
  title,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{groups.length}</Text>
        </View>
      </View>

      {groups.length > 0 ? (
        <View style={styles.list}>
          {groups.map((group) => (
            <GroupRow group={group} key={group.id} onOpenGroup={onOpenGroup} />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons color={colors.playAccentStrong} name="cards-diamond-outline" size={32} />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyBody}>{emptyBody}</Text>
        </View>
      )}
    </View>
  );
}

function GroupRow({ group, onOpenGroup }: { group: BadmintonGroup; onOpenGroup: Props['onOpenGroup'] }) {
  const open = useGroupAction(group.id, onOpenGroup);
  const tone = groupTone(group.goal_tags[0]);

  return (
    <Pressable
      accessibilityHint="Opens group details"
      accessibilityLabel={`${group.name}, ${group.member_count} members, ${group.city}`}
      accessibilityRole="button"
      onPress={open}
      style={groupRowStyle}
    >
      <View style={[styles.iconTile, tone.surface]}>
        <MaterialCommunityIcons color={tone.strong} name={tone.icon} size={25} />
      </View>
      <View style={styles.groupCopy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
          <Ionicons
            color={colors.textSubtle}
            name={group.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
            size={14}
          />
        </View>
        <Text numberOfLines={1} style={styles.groupMeta}>
          {group.city} · {memberCountLabel(group.member_count)}
        </Text>
        <Text numberOfLines={1} style={[styles.groupGoals, tone.text]}>{groupGoalsLabel(group.goal_tags)}</Text>
      </View>
      <Ionicons color={colors.primaryStrong} name="chevron-forward" size={21} />
    </Pressable>
  );
}

function useGroupAction(groupId: string, onOpenGroup: Props['onOpenGroup']) {
  return useCallback(() => {
    onOpenGroup(groupId);
  }, [groupId, onOpenGroup]);
}

function groupRowStyle({ pressed }: PressableStateCallbackType) {
  return [styles.row, pressed && styles.rowPressed];
}

function groupTone(goal?: GroupGoal) {
  switch (goal) {
    case 'social':
      return { icon: 'party-popper' as const, strong: colors.socialAccentStrong, surface: styles.socialSurface, text: styles.socialText };
    case 'competitive':
      return { icon: 'trophy-outline' as const, strong: colors.energyAccentStrong, surface: styles.energySurface, text: styles.energyText };
    case 'fitness':
      return { icon: 'heart-pulse' as const, strong: colors.primaryStrong, surface: styles.primarySurface, text: styles.primaryText };
    default:
      return { icon: 'badminton' as const, strong: colors.playAccentStrong, surface: styles.playSurface, text: styles.playText };
  }
}

function memberCountLabel(count: number) {
  return `${count} ${count === 1 ? 'member' : 'members'}`;
}

function groupGoalsLabel(goals: readonly GroupGoal[]) {
  if (goals.length === 0) return 'Badminton community';
  return goals.slice(0, 3).map(groupGoalLabel).join(' · ');
}

function groupGoalLabel(goal: GroupGoal) {
  switch (goal) {
    case 'consistent_play': return 'Consistent play';
    default: return `${goal.charAt(0).toLocaleUpperCase()}${goal.slice(1)}`;
  }
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  headingCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 21, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  countBadge: {
    alignItems: 'center',
    backgroundColor: colors.playAccentSurface,
    borderRadius: 99,
    justifyContent: 'center',
    minWidth: 30,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  countText: { color: colors.playAccentStrong, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  list: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 92,
    paddingVertical: 13,
  },
  rowPressed: { backgroundColor: colors.primarySurface },
  iconTile: { alignItems: 'center', borderRadius: 15, height: 58, justifyContent: 'center', width: 58 },
  playSurface: { backgroundColor: colors.playAccentSurface },
  socialSurface: { backgroundColor: colors.socialAccentSurface },
  energySurface: { backgroundColor: colors.energyAccentSurface },
  primarySurface: { backgroundColor: colors.primarySurface },
  groupCopy: { flex: 1, gap: 3, minWidth: 0 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  groupName: { color: colors.text, flexShrink: 1, fontFamily: fonts.black, fontSize: 15, fontWeight: '900' },
  groupMeta: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11 },
  groupGoals: { fontFamily: fonts.bold, fontSize: 10, fontWeight: '700' },
  playText: { color: colors.playAccentStrong },
  socialText: { color: colors.socialAccentStrong },
  energyText: { color: colors.energyAccentStrong },
  primaryText: { color: colors.primaryStrong },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 13 },
  emptyTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' },
  emptyBody: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
