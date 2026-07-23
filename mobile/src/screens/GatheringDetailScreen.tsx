import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient, type QueryObserverResult } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getApiGatheringsByGatheringId,
  getApiGatheringsByGatheringIdMe,
  postApiGatheringsByGatheringIdFinish,
  postApiGatheringsByGatheringIdJoin,
  type Gathering,
  type GatheringParticipant,
  type GatheringViewerState,
  type Workout,
} from '../api/generated';
import { apiData, authHeaders } from '../api/runtime';
import { useSession } from '../auth/session';
import { errorMessage } from '../common/errors';
import { GatheringDetailHero } from '../components/gatherings';
import { Button, colors, fonts } from '../components/ui';
import { gatheringKindLabel, type GatheringKind } from '../features/gatherings/gatheringDraft';
import {
  formatGatheringSchedule,
  formatGatheringVenue,
  normalizeGatheringTheme,
  resolveGatheringCoverUrl,
} from '../features/gatherings/gatheringPresentation';

export function GatheringDetailScreen() {
  const params = useLocalSearchParams<{ gatheringId?: string | string[] }>();
  const gatheringId = singleParam(params.gatheringId);
  const { user } = useSession();
  const query = useGatheringDetail(gatheringId, user?.id ?? '');
  const viewerQuery = useGatheringViewerState(gatheringId, user?.id ?? '');
  const participation = useGatheringParticipation(gatheringId, user?.id ?? '');
  const addActivityPost = useGatheringPostNavigation(gatheringId, viewerQuery.data?.workout_id ?? '');
  const viewActivityPost = usePostDetailNavigation(viewerQuery.data?.post_id ?? '');
  const goBack = useGatheringBackNavigation();
  const retry = useGatheringRetry(query.refetch);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <GatheringDetailHeader onBack={goBack} />
      {query.data ? (
        <GatheringDetailContent
          gathering={query.data}
          isFinishing={participation.isFinishing}
          isJoining={participation.isJoining}
          onAddPost={addActivityPost}
          onFinish={participation.finish}
          onJoin={participation.join}
          onViewPost={viewActivityPost}
          viewerState={viewerQuery.data}
        />
      ) : query.isPending ? (
        <GatheringDetailLoading />
      ) : (
        <GatheringDetailError onRetry={retry} />
      )}
    </SafeAreaView>
  );
}

function GatheringDetailContent({
  gathering,
  isFinishing,
  isJoining,
  onAddPost,
  onFinish,
  onJoin,
  onViewPost,
  viewerState,
}: {
  gathering: Gathering;
  isFinishing: boolean;
  isJoining: boolean;
  onAddPost: () => void;
  onFinish: () => void;
  onJoin: () => void;
  onViewPost: () => void;
  viewerState?: GatheringViewerState;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <GatheringDetailHero
        coverImageUrl={resolveGatheringCoverUrl(gathering.cover_image_url)}
        kindLabel={gatheringKindLabel(gathering.kind as GatheringKind)}
        locationLabel={formatGatheringVenue(gathering.venue, gathering.city)}
        scheduleLabel={formatGatheringSchedule(gathering.starts_at, gathering.ends_at)}
        themeId={normalizeGatheringTheme(gathering.theme, gathering.kind as GatheringKind)}
        title={gathering.title}
        visibility={gathering.visibility}
      />

      {gathering.description && (
        <GatheringDetailSection icon="text-outline" title="About this gathering">
          <Text style={styles.description}>{gathering.description}</Text>
        </GatheringDetailSection>
      )}

      <GatheringDetailSection icon="information-circle-outline" title="Host details">
        <DetailRow
          icon="shield-checkmark-outline"
          label="Access"
          value={accessLabel(gathering)}
        />
        <DetailRow
          icon="people-outline"
          label="Capacity"
          value={gathering.capacity ? `${gathering.capacity} people` : 'Unlimited'}
        />
        <DetailRow
          icon="wallet-outline"
          label="Cost"
          value={formatCost(gathering.cost_per_person_cents, gathering.currency)}
        />
        {gathering.court_setup && (
          <DetailRow
            icon="grid-outline"
            label="Court setup"
            value={courtSetupLabel(gathering)}
          />
        )}
      </GatheringDetailSection>

      <GatheringParticipationActions
        gathering={gathering}
        isFinishing={isFinishing}
        isJoining={isJoining}
        onAddPost={onAddPost}
        onFinish={onFinish}
        onJoin={onJoin}
        onViewPost={onViewPost}
        viewerState={viewerState}
      />
    </ScrollView>
  );
}

function GatheringParticipationActions({
  gathering,
  isFinishing,
  isJoining,
  onAddPost,
  onFinish,
  onJoin,
  onViewPost,
  viewerState,
}: {
  gathering: Gathering;
  isFinishing: boolean;
  isJoining: boolean;
  onAddPost: () => void;
  onFinish: () => void;
  onJoin: () => void;
  onViewPost: () => void;
  viewerState?: GatheringViewerState;
}) {
  const status = viewerState?.participant_status;
  const hasActivity = Boolean(viewerState?.workout_id);
  const hasPost = Boolean(viewerState?.post_id);
  const joinLabel = status === 'invited'
    ? 'Accept invitation'
    : gathering.join_policy === 'members_only'
      ? 'Request group access'
    : gathering.join_policy === 'approval_required'
      ? 'Request to join'
      : 'Join gathering';
  const isPlayGathering = gathering.kind !== 'social';

  return (
    <View style={styles.participationSection}>
      <View style={styles.participationHeading}>
        <MaterialCommunityIcons color={colors.primaryStrong} name="badminton" size={27} />
        <View style={styles.rsvpCopy}>
          <Text style={styles.rsvpTitle}>{participationTitle(status, hasActivity)}</Text>
          <Text style={styles.rsvpBody}>
            {participationBody(status, hasActivity, hasPost, viewerState?.can_finish ?? false, gathering.kind)}
          </Text>
        </View>
      </View>
      {(!status || status === 'invited') && <Button loading={isJoining} onPress={onJoin}>{joinLabel}</Button>}
      {status === 'going' && !hasActivity && isPlayGathering && (
        <Button disabled={!viewerState?.can_finish} icon="checkmark-circle" loading={isFinishing} onPress={onFinish}>
          Finish my session
        </Button>
      )}
      {hasActivity && !hasPost && <Button icon="create-outline" onPress={onAddPost}>Add activity post</Button>}
      {hasPost && <Button icon="open-outline" onPress={onViewPost}>View activity post</Button>}
    </View>
  );
}

function participationTitle(status: GatheringViewerState['participant_status'], hasActivity: boolean) {
  if (hasActivity) return 'Session completed';
  if (status === 'pending') return 'Request pending';
  if (status === 'invited') return 'You are invited';
  if (status === 'going') return 'You joined this gathering';
  return 'Play, then share';
}

function participationBody(
  status: GatheringViewerState['participant_status'],
  hasActivity: boolean,
  hasPost: boolean,
  canFinish: boolean,
  kind: Gathering['kind'],
) {
  if (hasPost) return 'Your event-linked activity post is live.';
  if (hasActivity) return 'Your manual activity is saved and ready for your post.';
  if (status === 'pending') return 'The host needs to approve your request before you can take part.';
  if (status === 'going' && kind === 'social') return 'You are on the guest list. Social-only gatherings do not create workout posts.';
  if (status === 'going' && canFinish) return 'When you are done playing, finish your session to add an activity post.';
  if (status === 'going') return 'Finish becomes available when the scheduled session starts.';
  return 'Posts come from gatherings you actually joined—no phone timer needed.';
}

function courtSetupLabel(gathering: Gathering) {
  if (gathering.court_setup === 'drop_in') return 'Drop-in';
  if (!gathering.court_count) return 'Courts reserved';
  return `${gathering.court_count} reserved ${gathering.court_count === 1 ? 'court' : 'courts'}`;
}

function GatheringDetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <View accessibilityRole="header" style={styles.header}>
      <Pressable
        accessibilityLabel="Back to Discover"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onBack}
        style={styles.headerButton}
      >
        <Ionicons color={colors.text} name="chevron-back" size={28} />
      </Pressable>
      <Text style={styles.headerTitle}>Gathering</Text>
      <View accessible={false} style={styles.headerButton} />
    </View>
  );
}

function GatheringDetailSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons color={colors.primary} name={icon} size={20} />
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} accessible style={styles.detailRow}>
      <Ionicons color={colors.textMuted} name={icon} size={19} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function GatheringDetailLoading() {
  return (
    <View accessibilityLabel="Loading gathering" accessibilityRole="progressbar" style={styles.centeredState}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.stateText}>Loading gathering...</Text>
    </View>
  );
}

function GatheringDetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centeredState}>
      <Ionicons color={colors.textMuted} name="calendar-outline" size={36} />
      <Text accessibilityRole="header" style={styles.stateTitle}>Gathering unavailable</Text>
      <Text style={styles.stateText}>It may be private, removed, or the API may need to be restarted.</Text>
      <Button onPress={onRetry} variant="secondary">Try again</Button>
    </View>
  );
}

function useGatheringDetail(gatheringId: string, userId: string) {
  return useQuery({
    enabled: Boolean(gatheringId && userId),
    queryKey: ['gatherings', 'detail', gatheringId, userId],
    queryFn: () => apiData<Gathering>(getApiGatheringsByGatheringId({
      headers: authHeaders(userId),
      path: { gathering_id: gatheringId },
    })),
  });
}

function useGatheringViewerState(gatheringId: string, userId: string) {
  return useQuery({
    enabled: Boolean(gatheringId && userId),
    queryKey: ['gatherings', 'viewer', gatheringId, userId],
    queryFn: () => apiData<GatheringViewerState>(getApiGatheringsByGatheringIdMe({
      headers: authHeaders(userId),
      path: { gathering_id: gatheringId },
    })),
  });
}

function useGatheringParticipation(gatheringId: string, userId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const refreshViewerState = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['gatherings', 'viewer', gatheringId, userId] }),
      queryClient.invalidateQueries({ queryKey: ['gatherings'] }),
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
    ]);
  }, [gatheringId, queryClient, userId]);
  const joinMutation = useMutation({
    mutationFn: () => apiData<GatheringParticipant>(postApiGatheringsByGatheringIdJoin({
      headers: authHeaders(userId),
      path: { gathering_id: gatheringId },
    })),
    onError: showGatheringError,
    onSuccess: refreshViewerState,
  });
  const finishMutation = useMutation({
    mutationFn: () => apiData<Workout>(postApiGatheringsByGatheringIdFinish({
      headers: authHeaders(userId),
      path: { gathering_id: gatheringId },
    })),
    onError: showGatheringError,
    onSuccess: (workout) => {
      void refreshViewerState();
      router.push({
        pathname: '/gatherings/[gatheringId]',
        params: { gatheringId, workoutId: workout.id },
      });
    },
  });
  const join = useCallback(() => joinMutation.mutate(), [joinMutation]);
  const finish = useCallback(() => finishMutation.mutate(), [finishMutation]);

  return {
    finish,
    isFinishing: finishMutation.isPending,
    isJoining: joinMutation.isPending,
    join,
  };
}

function showGatheringError(error: unknown) {
  Alert.alert('Friendminton', errorMessage(error));
}

function useGatheringBackNavigation() {
  const router = useRouter();
  return useCallback(() => router.back(), [router]);
}

function useGatheringPostNavigation(gatheringId: string, workoutId: string) {
  const router = useRouter();
  return useCallback(() => {
    if (!gatheringId || !workoutId) return;
    router.push({
      pathname: '/gatherings/[gatheringId]',
      params: { gatheringId, workoutId },
    });
  }, [gatheringId, router, workoutId]);
}

function usePostDetailNavigation(postId: string) {
  const router = useRouter();
  return useCallback(() => {
    if (!postId) return;
    router.push({ pathname: '/posts/[postId]', params: { postId } });
  }, [postId, router]);
}

function useGatheringRetry(refetch: () => Promise<QueryObserverResult<Gathering, Error>>) {
  return useCallback(() => {
    void refetch();
  }, [refetch]);
}

function accessLabel(gathering: Gathering) {
  const visibility = gathering.visibility === 'private' ? 'Private' : 'Public';
  const policy = gathering.join_policy === 'invite_only'
    ? 'invite only'
    : gathering.join_policy === 'approval_required'
      ? 'approval required'
      : gathering.join_policy === 'members_only'
        ? 'members only'
        : 'open RSVP';
  return `${visibility} · ${policy}`;
}

function formatCost(cents: number, currency: string) {
  if (cents <= 0) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, {
      currency: currency || 'USD',
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      style: 'currency',
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || 'USD'}`;
  }
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: 10,
  },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { color: colors.text, flex: 1, fontFamily: fonts.black, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  content: { backgroundColor: colors.surface, paddingBottom: 32 },
  section: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  description: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  detailRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingVertical: 6,
  },
  detailLabel: { color: colors.textMuted, flex: 1, fontFamily: fonts.bold, fontSize: 13, fontWeight: '700' },
  detailValue: { color: colors.text, fontFamily: fonts.black, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  participationSection: {
    backgroundColor: colors.accentSurface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  participationHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  rsvpCopy: { flex: 1, gap: 3 },
  rsvpTitle: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
  rsvpBody: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  centeredState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 30 },
  stateTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  stateText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
