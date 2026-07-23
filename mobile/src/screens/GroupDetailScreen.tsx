import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, type QueryObserverResult } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiGroupsByGroupId, type BadmintonGroup, type GroupGoal } from '../api/generated';
import { apiData, authHeaders } from '../api/runtime';
import { useSession } from '../auth/session';
import { Button, colors, fonts } from '../components/ui';

export function GroupDetailScreen() {
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = singleParam(params.groupId);
  const { user } = useSession();
  const query = useGroupDetail(groupId, user?.id ?? '');
  const goBack = useGroupBackNavigation();
  const hostEvent = useGroupEventCreatorNavigation(groupId, query.data?.name ?? '', query.data?.city ?? '');
  const retry = useGroupRetry(query.refetch);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <GroupDetailHeader onBack={goBack} />
      {query.data ? (
        <GroupDetailContent
          canHostEvents={query.data.owner_id === user?.id}
          group={query.data}
          onHostEvent={hostEvent}
        />
      ) : query.isPending ? (
        <GroupDetailLoading />
      ) : (
        <GroupDetailError onRetry={retry} />
      )}
    </SafeAreaView>
  );
}

function GroupDetailContent({
  canHostEvents,
  group,
  onHostEvent,
}: {
  canHostEvents: boolean;
  group: BadmintonGroup;
  onHostEvent: () => void;
}) {
  const tone = groupDetailTone(group.goal_tags[0]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={tone.gradient} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons color={colors.textInverse} name={tone.icon} size={38} />
        </View>
        <View style={styles.visibilityBadge}>
          <Ionicons
            color={colors.textInverse}
            name={group.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
            size={14}
          />
          <Text style={styles.visibilityText}>{visibilityLabel(group.visibility)}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.name}>{group.name}</Text>
        <Text style={styles.city}>{group.city}</Text>
      </LinearGradient>

      <View style={styles.stats}>
        <GroupStat label="Members" value={`${group.member_count}`} />
        <GroupStat label="Access" value={joinPolicyLabel(group.join_policy)} />
        <GroupStat label="Goals" value={`${group.goal_tags.length}`} />
      </View>

      {canHostEvents && (
        <Button icon="calendar-outline" onPress={onHostEvent}>Host a group event</Button>
      )}

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons color={colors.primaryStrong} name="people-outline" size={20} />
          <Text style={styles.sectionTitle}>About this group</Text>
        </View>
        <Text style={styles.description}>{group.description?.trim() || 'This group has not added a description yet.'}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons color={colors.energyAccentStrong} name="sparkles-outline" size={20} />
          <Text style={styles.sectionTitle}>What brings them together</Text>
        </View>
        <View style={styles.goals}>
          {group.goal_tags.length > 0 ? group.goal_tags.map((goal) => (
            <View key={goal} style={styles.goalBadge}>
              <Text style={styles.goalText}>{groupGoalLabel(goal)}</Text>
            </View>
          )) : <Text style={styles.description}>Badminton, community, and finding people to play with.</Text>}
        </View>
      </View>
    </ScrollView>
  );
}

function GroupDetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back to profile" accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.headerButton}>
        <Ionicons color={colors.text} name="chevron-back" size={28} />
      </Pressable>
      <Text style={styles.headerTitle}>Group</Text>
      <View style={styles.headerButton} />
    </View>
  );
}

function GroupStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>{value}</Text>
    </View>
  );
}

function GroupDetailLoading() {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator color={colors.primaryStrong} size="large" />
      <Text style={styles.stateText}>Loading group...</Text>
    </View>
  );
}

function GroupDetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centeredState}>
      <MaterialCommunityIcons color={colors.textMuted} name="cards-diamond-outline" size={42} />
      <Text style={styles.stateTitle}>Group unavailable</Text>
      <Text style={styles.stateText}>This group may be private, removed, or temporarily unavailable.</Text>
      <Button onPress={onRetry} variant="secondary">Try again</Button>
    </View>
  );
}

function useGroupDetail(groupId: string, userId: string) {
  const load = useCallback(
    () => apiData<BadmintonGroup>(getApiGroupsByGroupId({
      headers: authHeaders(userId),
      path: { group_id: groupId },
    })),
    [groupId, userId],
  );
  return useQuery({
    enabled: groupId.length > 0 && userId.length > 0,
    queryFn: load,
    queryKey: ['groups', 'detail', groupId, userId],
  });
}

function useGroupBackNavigation() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);
}

function useGroupEventCreatorNavigation(groupId: string, groupName: string, city: string) {
  const router = useRouter();
  return useCallback(() => {
    router.push({
      pathname: '/gatherings/new',
      params: { city, groupId, groupName },
    });
  }, [city, groupId, groupName, router]);
}

function useGroupRetry(refetch: () => Promise<QueryObserverResult<BadmintonGroup, Error>>) {
  return useCallback(() => {
    void refetch();
  }, [refetch]);
}

function groupDetailTone(goal?: GroupGoal) {
  switch (goal) {
    case 'social':
      return { gradient: [colors.energyAccent, colors.socialAccent] as const, icon: 'party-popper' as const };
    case 'competitive':
      return { gradient: [colors.primaryStrong, colors.energyAccent] as const, icon: 'trophy-outline' as const };
    default:
      return { gradient: [colors.playAccentStrong, colors.playAccent] as const, icon: 'badminton' as const };
  }
}

function visibilityLabel(value: BadmintonGroup['visibility']) {
  return value === 'private' ? 'Private group' : 'Public group';
}

function joinPolicyLabel(value: BadmintonGroup['join_policy']) {
  if (value === 'approval_required') return 'Approval';
  if (value === 'invite_only') return 'Invite';
  return 'Open';
}

function groupGoalLabel(goal: GroupGoal) {
  if (goal === 'consistent_play') return 'Consistent play';
  return `${goal.charAt(0).toLocaleUpperCase()}${goal.slice(1)}`;
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  headerButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  content: { gap: 16, padding: 20, paddingBottom: 40 },
  hero: { borderRadius: 24, gap: 8, minHeight: 230, overflow: 'hidden', padding: 22 },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.imageOverlay,
    borderRadius: 20,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  visibilityBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.imageOverlay,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  visibilityText: { color: colors.textInverse, fontFamily: fonts.bold, fontSize: 10, fontWeight: '700' },
  name: { color: colors.textInverse, fontFamily: fonts.black, fontSize: 29, fontWeight: '900', lineHeight: 34, marginTop: 'auto' },
  city: { color: colors.imageOverlayText, fontFamily: fonts.bold, fontSize: 13, fontWeight: '700' },
  stats: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', padding: 14 },
  stat: { alignItems: 'center', flex: 1, gap: 3, minWidth: 0 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10 },
  statValue: { color: colors.text, fontFamily: fonts.black, fontSize: 15, fontWeight: '900' },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 17, fontWeight: '900' },
  description: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalBadge: { backgroundColor: colors.socialAccentSurface, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 },
  goalText: { color: colors.socialAccentStrong, fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  centeredState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 30 },
  stateTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 21, fontWeight: '900' },
  stateText: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
