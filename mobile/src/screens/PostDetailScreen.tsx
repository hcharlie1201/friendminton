import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiPostsByPostId, type FeedPost } from '../api/generated';
import { apiData } from '../api/runtime';
import { PostPhotoGallery } from '../components/feed/PostPhotoGallery';
import { Button, colors, fonts } from '../components/ui';
import { estimateBadmintonSession, type BadmintonEstimate } from '../features/posts/badmintonEstimates';
import { findCachedFeedPost } from '../features/posts/feed';
import { formatElapsedTime } from '../lib/duration';
import { formatDate } from '../lib/dates';

export function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const postId = singleParam(params.postId);
  const postQuery = usePostDetail(postId);
  const goBack = useBackNavigation();
  const retry = usePostRetry(postQuery.refetch);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <DetailHeader onBack={goBack} />
      {postQuery.data ? (
        <PostDetailContent post={postQuery.data} />
      ) : postQuery.isPending ? (
        <DetailLoading />
      ) : (
        <DetailError onRetry={retry} />
      )}
    </SafeAreaView>
  );
}

function PostDetailContent({ post }: { post: FeedPost }) {
  const estimates = estimateBadmintonSession(post);
  const occurredAt = post.workout_occurred_at ?? post.created_at;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(post.display_name)}</Text>
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{post.display_name}</Text>
          <Text style={styles.meta}>{formatDate(occurredAt)}{post.location ? ` · ${post.location}` : ''}</Text>
        </View>
      </View>

      <View style={styles.heroCopy}>
        <Text style={styles.eyebrow}>{activityTypeLabel(post.workout_type)}</Text>
        <Text style={styles.title}>{post.workout_title ?? 'Badminton activity'}</Text>
        {post.body.length > 0 && <Text style={styles.body}>{post.body}</Text>}
      </View>

      {post.image_urls.length > 0 && (
        <PostPhotoGallery displayHeight={310} imageRefreshToken={0} imageUrls={post.image_urls} />
      )}

      <SectionDivider />
      <SessionSummary estimates={estimates} post={post} />
      <SectionDivider />
      <EstimatedCourtInsights estimates={estimates} />
    </ScrollView>
  );
}

function DetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back to activity feed"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onBack}
        style={styles.headerButton}
      >
        <Ionicons color={colors.text} name="chevron-back" size={28} />
      </Pressable>
      <Text style={styles.headerTitle}>Badminton Activity</Text>
      <View style={styles.headerButton} />
    </View>
  );
}

function SessionSummary({
  estimates,
  post,
}: {
  estimates: BadmintonEstimate | null;
  post: FeedPost;
}) {
  const duration = post.workout_duration_milliseconds;
  const calories = post.workout_calories ?? estimates?.calories;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Session Summary</Text>
        <Text style={styles.sectionSubtitle}>Recorded workout details</Text>
      </View>
      <View style={styles.metricGrid}>
        <DetailMetric
          bordered
          label="Active time"
          value={duration ? formatElapsedTime(duration) : 'Unavailable'}
        />
        <DetailMetric
          label="Effort"
          value={post.effort ? `${post.effort} / 10` : 'Not rated'}
        />
        <DetailMetric
          bordered
          label={post.workout_calories == null ? 'Calories (est.)' : 'Calories'}
          value={calories == null ? 'Unavailable' : `${calories} Cal`}
        />
        <DetailMetric label="Workout" value={activityTypeLabel(post.workout_type)} />
      </View>
    </View>
  );
}

function DetailMetric({ bordered = false, label, value }: { bordered?: boolean; label: string; value: string }) {
  return (
    <View style={[styles.metric, bordered && styles.metricBorder]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function EstimatedCourtInsights({ estimates }: { estimates: BadmintonEstimate | null }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.insightsTitleRow}>
          <Text style={styles.sectionTitle}>Estimated Court Insights</Text>
          <View style={styles.experimentalBadge}>
            <Text style={styles.experimentalBadgeText}>EXPERIMENTAL</Text>
          </View>
        </View>
        <Text style={styles.sectionSubtitle}>
          Early predictions based on recorded time, workout type, player skill level, and self-reported effort.
        </Text>
      </View>

      {estimates ? (
        <View style={styles.insights}>
          <InsightRow
            description="Estimated lower-body demand from session length and intensity."
            label="Footwork load"
            progress={estimates.footworkLoad}
            value={`${estimates.footworkLoad} / 100`}
          />
          <InsightRow
            description="Approximate racket strokes across rallies and drills."
            label="Estimated swings"
            progress={Math.min(100, Math.round(estimates.strokeVolume / 14))}
            value={`~${estimates.strokeVolume.toLocaleString()}`}
          />
          <InsightRow
            description="Modelled target-zone accuracy—not measured shot placement."
            label="Predicted shot accuracy"
            progress={estimates.predictedShotAccuracy}
            value={`~${estimates.predictedShotAccuracy}%`}
          />
        </View>
      ) : (
        <View style={styles.noEstimates}>
          <Ionicons color={colors.textMuted} name="analytics-outline" size={24} />
          <Text style={styles.noEstimatesText}>Record a timed workout to unlock estimated court insights.</Text>
        </View>
      )}

      <View style={styles.disclaimer}>
        <Ionicons color={colors.primaryStrong} name="information-circle-outline" size={19} />
        <Text style={styles.disclaimerText}>
          These are low-confidence estimates, not sensor or video measurements. Future wearable and camera data can replace them with observed footwork and shot analytics.
        </Text>
      </View>
    </View>
  );
}

function InsightRow({
  description,
  label,
  progress,
  value,
}: {
  description: string;
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}. ${description}`}
      accessible
      style={styles.insight}
    >
      <View style={styles.insightHeader}>
        <Text style={styles.insightLabel}>{label}</Text>
        <Text style={styles.insightValue}>{value}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.insightDescription}>{description}</Text>
    </View>
  );
}

function DetailLoading() {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.stateText}>Loading activity...</Text>
    </View>
  );
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centeredState}>
      <Ionicons color={colors.textMuted} name="cloud-offline-outline" size={34} />
      <Text style={styles.stateTitle}>Activity unavailable</Text>
      <Text style={styles.stateText}>The post may have been removed, or the API needs to be restarted.</Text>
      <Button onPress={onRetry} variant="secondary">Try again</Button>
    </View>
  );
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

function usePostDetail(postId: string) {
  const queryClient = useQueryClient();
  const load = useCallback(() => loadPost(postId), [postId]);

  return useQuery({
    enabled: postId.length > 0,
    initialData: postId ? findCachedFeedPost(queryClient, postId) : undefined,
    queryFn: load,
    queryKey: ['post', postId],
  });
}

function useBackNavigation() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);
}

function usePostRetry(refetch: () => Promise<unknown>) {
  return useCallback(() => {
    void refetch();
  }, [refetch]);
}

async function loadPost(postId: string) {
  if (!postId) throw new Error('Missing post id');
  return apiData<FeedPost>(getApiPostsByPostId({ path: { post_id: postId } }));
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function activityTypeLabel(value: string | null | undefined) {
  switch (value) {
    case 'drills':
      return 'Badminton Drills';
    case 'conditioning':
      return 'Court Conditioning';
    case 'lesson':
      return 'Badminton Lesson';
    case 'open_play':
      return 'Open Play';
    default:
      return 'Badminton Match';
  }
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 10,
  },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.black,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  scrollContent: { backgroundColor: colors.surface, paddingBottom: 42 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 20, paddingBottom: 14 },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  avatarText: { color: colors.textOnPrimary, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
  identityCopy: { flex: 1, gap: 3 },
  name: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' },
  meta: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  heroCopy: { gap: 8, paddingBottom: 20, paddingHorizontal: 20 },
  eyebrow: {
    color: colors.primaryStrong,
    fontFamily: fonts.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 29, fontWeight: '900', lineHeight: 35 },
  body: { color: colors.text, fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  sectionDivider: { backgroundColor: colors.background, height: 8 },
  section: { gap: 22, paddingHorizontal: 20, paddingVertical: 26 },
  sectionHeading: { gap: 6 },
  sectionTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 25, fontWeight: '900' },
  sectionSubtitle: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  metricGrid: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metric: { gap: 5, paddingHorizontal: 14, paddingVertical: 18, width: '50%' },
  metricBorder: { borderRightColor: colors.border, borderRightWidth: StyleSheet.hairlineWidth },
  metricLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
  metricValue: { color: colors.text, fontFamily: fonts.black, fontSize: 20, fontWeight: '900' },
  insightsTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  experimentalBadge: {
    backgroundColor: colors.primarySurface,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  experimentalBadgeText: {
    color: colors.primaryStrong,
    fontFamily: fonts.black,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  insights: { gap: 26 },
  insight: { gap: 9 },
  insightHeader: { alignItems: 'baseline', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  insightLabel: { color: colors.text, flex: 1, fontFamily: fonts.bold, fontSize: 16, fontWeight: '700' },
  insightValue: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  progressTrack: { backgroundColor: colors.primarySurface, borderRadius: 5, height: 10, overflow: 'hidden' },
  progressFill: { backgroundColor: colors.primary, borderRadius: 5, height: '100%' },
  insightDescription: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  noEstimates: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 8 },
  noEstimatesText: { color: colors.textMuted, flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  disclaimer: {
    alignItems: 'flex-start',
    backgroundColor: colors.primarySurface,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 9,
    padding: 13,
  },
  disclaimerText: { color: colors.primaryStrong, flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  centeredState: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  stateTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 22, fontWeight: '900' },
  stateText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
