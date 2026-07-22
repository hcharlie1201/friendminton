import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getApiGatheringsByGatheringId,
  postApiPosts,
  type Gathering,
  type Post,
} from '../api/generated';
import { apiData, authHeaders } from '../api/runtime';
import { useSession } from '../auth/session';
import { errorMessage } from '../common/errors';
import { PostComposer } from '../components/feed/PostComposer';
import { colors, fonts } from '../components/ui';
import { formatGatheringSchedule } from '../features/gatherings/gatheringPresentation';
import { emptyPostDraft, type PostDraft } from '../features/posts/postDraft';
import { feedQueryKey } from '../features/posts/feed';
import { uploadPostPhotos } from '../features/posts/uploads';

export function FinishGatheringActivityScreen() {
  const params = useLocalSearchParams<{
    gatheringId?: string | string[];
    workoutId?: string | string[];
  }>();
  const gatheringId = singleParam(params.gatheringId);
  const workoutId = singleParam(params.workoutId);
  const { user } = useSession();
  const gatheringQuery = useGatheringForActivity(gatheringId, user?.id ?? '');
  const editor = useFinishedActivityEditor(gatheringId, workoutId, user?.id ?? '');

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <FinishActivityHeader onBack={editor.goBack} />
      {gatheringQuery.data ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.eventSummary}>
            <Text style={styles.eyebrow}>SESSION FINISHED</Text>
            <Text style={styles.eventTitle}>{gatheringQuery.data.title}</Text>
            <Text style={styles.eventMeta}>
              {formatGatheringSchedule(gatheringQuery.data.starts_at, gatheringQuery.data.ends_at)}
            </Text>
          </View>

          <View style={styles.watchNotice}>
            <Ionicons color={colors.primaryStrong} name="watch-outline" size={23} />
            <View style={styles.watchCopy}>
              <Text style={styles.watchTitle}>Manual activity for now</Text>
              <Text style={styles.watchBody}>
                Your session time comes from the event. Apple Watch sync is coming soon.
              </Text>
            </View>
          </View>

          <PostComposer
            allowEmpty
            contextLabel="Only players who joined can post this activity"
            draft={editor.draft}
            eyebrow="ADD YOUR ACTIVITY"
            isEditing={false}
            isSaving={editor.isSaving}
            onCancelEdit={editor.goBack}
            onChange={editor.setDraft}
            onSubmit={editor.submit}
            submitLabel="Post activity"
            title="How did you play?"
          />
        </ScrollView>
      ) : gatheringQuery.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <View style={styles.loading}>
          <Text style={styles.errorTitle}>Activity unavailable</Text>
          <Text style={styles.errorBody}>Go back to the gathering and finish your session again.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function FinishActivityHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back to gathering" hitSlop={10} onPress={onBack} style={styles.headerButton}>
        <Ionicons color={colors.text} name="chevron-back" size={28} />
      </Pressable>
      <Text style={styles.headerTitle}>Add activity</Text>
      <View style={styles.headerButton} />
    </View>
  );
}

function useGatheringForActivity(gatheringId: string, userId: string) {
  return useQuery({
    enabled: Boolean(gatheringId && userId),
    queryKey: ['gatherings', 'detail', gatheringId, userId],
    queryFn: () => apiData<Gathering>(getApiGatheringsByGatheringId({
      headers: authHeaders(userId),
      path: { gathering_id: gatheringId },
    })),
  });
}

function useFinishedActivityEditor(gatheringId: string, workoutId: string, userId: string) {
  const [draft, setDraft] = useState<PostDraft>(emptyPostDraft);
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () => createFinishedActivityPost(draft, workoutId, userId),
    onError: showPostError,
    onSuccess: async (post) => {
      await Promise.all([
        queryClient.resetQueries({ exact: true, queryKey: feedQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['weeklySnapshot', userId] }),
        queryClient.invalidateQueries({ queryKey: ['gatherings', 'viewer', gatheringId, userId] }),
      ]);
      router.replace({ pathname: '/posts/[postId]', params: { postId: post.id } });
    },
  });
  const goBack = useCallback(() => router.back(), [router]);
  const submit = useCallback(() => mutation.mutate(), [mutation]);

  return { draft, goBack, isSaving: mutation.isPending, setDraft, submit };
}

async function createFinishedActivityPost(draft: PostDraft, workoutId: string, userId: string) {
  if (!workoutId) throw new Error('This session is missing its completed activity.');
  const imageKeys = await uploadPostPhotos(userId, draft.photos);
  return apiData<Post>(postApiPosts({
    body: {
      body: draft.body.trim(),
      effort: draft.effort,
      image_keys: imageKeys,
      location: draft.location.trim() || null,
      workout_id: workoutId,
    },
    headers: authHeaders(userId),
  }));
}

function showPostError(error: unknown) {
  Alert.alert('Friendminton', errorMessage(error));
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
  content: { gap: 16, padding: 20, paddingBottom: 40 },
  eventSummary: { gap: 3 },
  eyebrow: { color: colors.primary, fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  eventTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 25, fontWeight: '900' },
  eventMeta: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 13, fontWeight: '700' },
  watchNotice: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  watchCopy: { flex: 1, gap: 2 },
  watchTitle: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
  watchBody: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  loading: { alignItems: 'center', flex: 1, gap: 8, justifyContent: 'center', padding: 30 },
  errorTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 20, fontWeight: '900' },
  errorBody: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 14, textAlign: 'center' },
});
