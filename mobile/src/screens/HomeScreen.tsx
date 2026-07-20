import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryFunctionContext,
} from '@tanstack/react-query';

import {
  getApiEngagementNotifications,
  getApiEngagementNotificationsUnreadCount,
  getApiEngagementWeeklySnapshot,
  getApiGameInvites,
  getApiPostsFeed,
  postApiEngagementNotificationsRead,
  postApiGameInvites,
  postApiPosts,
  postApiWorkouts,
  putApiPosts,
  type FeedPage,
  type FeedPost,
  type GameInvite,
  type Notification,
  type UnreadNotificationCount,
  type User,
  type WeeklySnapshot,
  type Workout,
} from '../api/generated';
import { apiBaseUrl } from '../config';
import { authHeaders, unwrap, unwrapEmpty } from '../api/runtime';
import { useSession } from '../auth/session';
import {
  AppHeader,
  BottomTabBar,
  HomeContent,
  InlineLoading,
  type DiscoveryPreferences,
  type HomeActions,
  type SkillLevel,
  type Tab,
} from '../components/home';
import { Screen, colors } from '../components/ui';
import { buildDefaultGameInvite } from '../features/gameInvites/defaultGameInvite';
import {
  draftFromPost,
  emptyPostDraft,
  imageUrlForLogs,
  postImageUrl,
  type PostDraft,
} from '../features/posts/postDraft';
import { uploadPostPhotos } from '../features/posts/uploads';
import { type RecordedWorkout, useWorkoutRecorder } from '../features/workouts/useWorkoutRecorder';
import { usePlayerSearch } from '../features/players/usePlayerSearch';

type WriteMutation = {
  mutate: () => void;
};

const feedQueryKey = ['feed', 'pages'] as const;
const feedPageSize = 20;
const feedLoadAheadDistance = 320;

function useDiscoveryPreferences() {
  const [city, setCity] = useState('Oakland');
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const apply = useCallback((preferences: DiscoveryPreferences) => {
    setCity(preferences.city);
    setSkillLevel(preferences.skillLevel);
  }, []);

  return { apply, city, setCity, skillLevel };
}

function useHomeRefresh(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  const [imageRefreshToken, setImageRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshHomeData(queryClient, userId);
      setImageRefreshToken((token) => token + 1);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, userId]);

  return { imageRefreshToken, isRefreshing, refresh };
}

function useFeedPagination({
  enabled,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: {
  enabled: boolean;
  fetchNextPage: () => Promise<unknown>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}) {
  const requestInFlight = useRef(false);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!enabled || !hasNextPage || isFetchingNextPage || requestInFlight.current) {
      return;
    }

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distanceFromBottom > feedLoadAheadDistance) {
      return;
    }

    requestInFlight.current = true;
    void fetchNextPage().finally(() => {
      requestInFlight.current = false;
    });
  }, [enabled, fetchNextPage, hasNextPage, isFetchingNextPage]);

  return onScroll;
}

export function HomeScreen() {
  const queryClient = useQueryClient();
  const homeScrollRef = useRef<ScrollView>(null);
  const { signOut, user } = useSession();
  const currentUser = requireSessionUser(user);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const discoveryPreferences = useDiscoveryPreferences();
  const { city, skillLevel } = discoveryPreferences;
  const [playerSearch, setPlayerSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [workoutTitle, setWorkoutTitle] = useState('Doubles ladder night');
  const [recordedWorkoutId, setRecordedWorkoutId] = useState<string | null>(null);
  const [postDraft, setPostDraft] = useState<PostDraft>(emptyPostDraft);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const workoutRecorder = useWorkoutRecorder();
  const homeRefresh = useHomeRefresh(queryClient, currentUser.id);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch(`${apiBaseUrl}/healthz`).then((response) => response.ok),
    retry: false,
  });
  const playersQuery = usePlayerSearch({
    city,
    enabled: activeTab === 'discover',
    query: playerSearch,
    skillLevel,
  });
  const feedQuery = useInfiniteQuery({
    queryKey: feedQueryKey,
    queryFn: loadFeedPage,
    initialPageParam: null as string | null,
    getNextPageParam: getNextFeedPageParam,
  });
  const snapshotQuery = useQuery({
    queryKey: ['weeklySnapshot', currentUser.id],
    queryFn: () =>
      getApiEngagementWeeklySnapshot({
        headers: authHeaders(currentUser.id),
      }).then(unwrap<WeeklySnapshot>),
  });
  const notificationsQuery = useQuery({
    queryKey: ['notifications', currentUser.id],
    queryFn: () =>
      getApiEngagementNotifications({
        headers: authHeaders(currentUser.id),
      }).then(unwrap<Notification[]>),
  });
  const unreadNotificationsQuery = useQuery({
    queryKey: ['notifications', 'unreadCount', currentUser.id],
    enabled: notificationsQuery.isSuccess,
    queryFn: () =>
      getApiEngagementNotificationsUnreadCount({
        headers: authHeaders(currentUser.id),
      }).then(unwrap<UnreadNotificationCount>),
  });
  const gameInvitesQuery = useQuery({
    queryKey: ['gameInvites', city, skillLevel],
    queryFn: () =>
      getApiGameInvites({
        query: {
          city,
          skill_level: skillLevel ?? undefined,
        },
      }).then(unwrap<GameInvite[]>),
  });
  const createPostMutation = useMutation({
    mutationFn: () =>
      savePost({
        draft: postDraft,
        postId: editingPostId,
        recordedWorkout: workoutRecorder.recordedWorkout,
        recordedWorkoutId,
        setRecordedWorkoutId,
        userId: currentUser.id,
        workoutTitle,
      }),
    onError: showError,
    onSuccess: async () => {
      resetPostEditor(setPostDraft, setEditingPostId);
      setRecordedWorkoutId(null);
      workoutRecorder.reset();
      setActiveTab('home');
      await invalidateHomeData(queryClient, currentUser.id);
    },
  });
  const createGameInviteMutation = useMutation({
    mutationFn: () =>
      postApiGameInvites({
        body: buildDefaultGameInvite(city),
        headers: authHeaders(currentUser.id),
      }).then(unwrap),
    onError: showError,
    onSuccess: async () => {
      setActiveTab('groups');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gameInvites'] }),
        queryClient.invalidateQueries({ queryKey: ['weeklySnapshot', currentUser.id] }),
      ]);
    },
  });
  const markNotificationsReadMutation = useMutation({
    mutationFn: () =>
      postApiEngagementNotificationsRead({
        headers: authHeaders(currentUser.id),
      }).then(unwrapEmpty),
    onError: showError,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] }),
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount', currentUser.id] }),
      ]);
    },
  });
  const players = playersQuery.data ?? [];
  const feed = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const gameInvites = gameInvitesQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const unreadNotificationCount = unreadNotificationsQuery.data?.count ?? 0;
  const isLoading =
    healthQuery.isLoading ||
    playersQuery.isFetching ||
    (feedQuery.isFetching && !feedQuery.isFetchingNextPage) ||
    snapshotQuery.isFetching ||
    gameInvitesQuery.isFetching ||
    createPostMutation.isPending ||
    createGameInviteMutation.isPending ||
    markNotificationsReadMutation.isPending;
  const actions = useHomeActions({
    createGameInviteMutation,
    createPostMutation,
    discardWorkout: workoutRecorder.reset,
    endWorkout: workoutRecorder.end,
    pauseWorkout: workoutRecorder.pause,
    resumeWorkout: workoutRecorder.resume,
    setActiveTab,
    setEditingPostId,
    setPostDraft,
    setRecordedWorkoutId,
    signOut,
    startWorkout: workoutRecorder.start,
    homeScrollRef,
  });
  const headerActions = useHeaderActions({
    markNotificationsReadMutation,
    setActiveTab,
    setPlayerSearch,
    setSearchOpen,
  });
  const onFeedScroll = useFeedPagination({
    enabled: activeTab === 'home',
    fetchNextPage: feedQuery.fetchNextPage,
    hasNextPage: feedQuery.hasNextPage,
    isFetchingNextPage: feedQuery.isFetchingNextPage,
  });

  return (
    <Screen>
      <AppHeader
        activeTab={activeTab}
        notificationCount={unreadNotificationCount}
        onClearSearch={headerActions.clearSearch}
        onCloseSearch={headerActions.closeSearch}
        onOpenNotifications={headerActions.openNotifications}
        onOpenSearch={headerActions.openSearch}
        onOpenSettings={headerActions.openSettings}
        onSearchChange={setPlayerSearch}
        searchOpen={searchOpen}
        searchIsLoading={playersQuery.isSearching}
        searchValue={playerSearch}
      />

      <ScrollView
        ref={homeScrollRef}
        contentContainerStyle={styles.content}
        onScroll={onFeedScroll}
        refreshControl={activeTab === 'home' ? (
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={homeRefresh.refresh}
            refreshing={homeRefresh.isRefreshing}
            tintColor={colors.primary}
            title="Refreshing activity..."
            titleColor={colors.muted}
          />
        ) : undefined}
        scrollEventThrottle={100}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && !homeRefresh.isRefreshing && <InlineLoading label="Refreshing court intel..." />}
        <HomeContent
          actions={actions}
          activeTab={activeTab}
          city={city}
          currentUser={currentUser}
          editingPostId={editingPostId}
          feed={feed}
          feedRefreshToken={homeRefresh.imageRefreshToken}
          gameInvites={gameInvites}
          notifications={notifications}
          onCityChange={discoveryPreferences.setCity}
          onDiscoveryPreferencesChange={discoveryPreferences.apply}
          onPostDraftChange={setPostDraft}
          onRetryPlayerSearch={playersQuery.refetch}
          players={players}
          playerSearchQuery={playersQuery.effectiveQuery}
          playerSearchHasError={playersQuery.isError}
          postDraft={postDraft}
          postIsSaving={createPostMutation.isPending}
          setWorkoutTitle={setWorkoutTitle}
          skillLevel={skillLevel}
          snapshot={snapshotQuery.data}
          workoutElapsedMilliseconds={workoutRecorder.elapsedMilliseconds}
          workoutPhase={workoutRecorder.phase}
          workoutTitle={workoutTitle}
        />
        {activeTab === 'home' && feedQuery.isFetchingNextPage && (
          <InlineLoading label="Loading more activities..." />
        )}
      </ScrollView>

      <BottomTabBar
        activeTab={activeTab}
        notificationCount={unreadNotificationCount}
        onTabChange={headerActions.changeTab}
      />
    </Screen>
  );
}

async function loadFeedPage({
  pageParam,
}: QueryFunctionContext<typeof feedQueryKey, string | null>) {
  const response = await getApiPostsFeed({
    query: {
      cursor: pageParam,
      limit: feedPageSize,
    },
  }).then(unwrap<FeedPage | FeedPost[]>);
  const page = Array.isArray(response)
    ? { items: response, next_cursor: null }
    : response;

  if (__DEV__) {
    console.info('[Friendminton:image] feed received', page.items.map((post) => ({
      imageKeys: post.image_keys,
      imageUrls: post.image_urls.map(imageUrlForLogs),
      postId: post.id,
      resolvedImageUrls: post.image_urls.map((url) => imageUrlForLogs(postImageUrl(url))),
    })));
  }

  return page;
}

function getNextFeedPageParam(lastPage: FeedPage) {
  return lastPage.next_cursor ?? undefined;
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  Alert.alert('Friendminton', message);
}

function requireSessionUser(user: ReturnType<typeof useSession>['user']) {
  if (!user) {
    throw new Error('HomeScreen requires an authenticated session');
  }

  return user;
}

function useHomeActions({
  createGameInviteMutation,
  createPostMutation,
  discardWorkout,
  endWorkout,
  pauseWorkout,
  resumeWorkout,
  setActiveTab,
  setEditingPostId,
  setPostDraft,
  setRecordedWorkoutId,
  signOut,
  startWorkout,
  homeScrollRef,
}: {
  createGameInviteMutation: WriteMutation;
  createPostMutation: WriteMutation;
  discardWorkout: () => void;
  endWorkout: () => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  setActiveTab: (tab: Tab) => void;
  setEditingPostId: (postId: string | null) => void;
  setPostDraft: (draft: PostDraft) => void;
  setRecordedWorkoutId: (workoutId: string | null) => void;
  signOut: () => Promise<void>;
  startWorkout: () => void;
  homeScrollRef: React.RefObject<ScrollView | null>;
}) {
  return useMemo(
    () => ({
      cancelPostEdit: () => resetPostEditor(setPostDraft, setEditingPostId),
      createGameInvite: () => createGameInviteMutation.mutate(),
      createPost: () => createPostMutation.mutate(),
      discardWorkout: () => resetWorkoutDraft(discardWorkout, setPostDraft, setRecordedWorkoutId),
      editPost: (post: FeedPost) =>
        beginPostEdit(post, setPostDraft, setEditingPostId, setActiveTab, homeScrollRef),
      endWorkout,
      pauseWorkout,
      resumeWorkout,
      signOut: () => void signOut(),
      startWorkout: () => beginWorkout(startWorkout, setPostDraft, setEditingPostId, setRecordedWorkoutId),
    }),
    [
      createGameInviteMutation,
      createPostMutation,
      discardWorkout,
      endWorkout,
      pauseWorkout,
      resumeWorkout,
      setActiveTab,
      setEditingPostId,
      setPostDraft,
      setRecordedWorkoutId,
      signOut,
      startWorkout,
      homeScrollRef,
    ],
  );
}

function changeTab(
  tab: Tab,
  setActiveTab: (tab: Tab) => void,
  setPlayerSearch: (query: string) => void,
  setSearchOpen: (open: boolean) => void,
) {
  setActiveTab(tab);
  setPlayerSearch('');
  setSearchOpen(false);
}

async function savePost({
  draft,
  postId,
  recordedWorkout,
  recordedWorkoutId,
  setRecordedWorkoutId,
  userId,
  workoutTitle,
}: {
  draft: PostDraft;
  postId: string | null;
  recordedWorkout: RecordedWorkout | null;
  recordedWorkoutId: string | null;
  setRecordedWorkoutId: (workoutId: string) => void;
  userId: string;
  workoutTitle: string;
}) {
  const imageKeys = await uploadPostPhotos(userId, draft.photos);
  const commonBody = {
    body: draft.body.trim(),
    effort: draft.effort,
    image_keys: imageKeys,
    location: draft.location.trim() || null,
  };
  const headers = authHeaders(userId);

  if (postId) {
    if (!draft.workoutId) {
      throw new Error('This post is not attached to a recorded workout and cannot be edited.');
    }
    return putApiPosts({ body: { ...commonBody, id: postId, workout_id: draft.workoutId }, headers }).then(unwrap);
  }

  if (!recordedWorkout) {
    throw new Error('Record and stop a workout before creating an activity post.');
  }

  let workoutId = recordedWorkoutId;
  if (!workoutId) {
    const workout = await postApiWorkouts({
      body: {
        calories: null,
        distance_meters: null,
        duration_milliseconds: Math.max(1, recordedWorkout.elapsedMilliseconds),
        notes: null,
        occurred_at: recordedWorkout.startedAt,
        title: workoutTitle.trim() || 'Badminton workout',
        workout_type: 'match',
      },
      headers,
    }).then(unwrap<Workout>);
    workoutId = workout.id;
    setRecordedWorkoutId(workoutId);
  }

  return postApiPosts({ body: { ...commonBody, workout_id: workoutId }, headers }).then(unwrap);
}

function beginWorkout(
  startWorkout: () => void,
  setPostDraft: (draft: PostDraft) => void,
  setEditingPostId: (postId: string | null) => void,
  setRecordedWorkoutId: (workoutId: string | null) => void,
) {
  resetPostEditor(setPostDraft, setEditingPostId);
  setRecordedWorkoutId(null);
  startWorkout();
}

function resetWorkoutDraft(
  discardWorkout: () => void,
  setPostDraft: (draft: PostDraft) => void,
  setRecordedWorkoutId: (workoutId: string | null) => void,
) {
  discardWorkout();
  setPostDraft(emptyPostDraft);
  setRecordedWorkoutId(null);
}

function beginPostEdit(
  post: FeedPost,
  setPostDraft: (draft: PostDraft) => void,
  setEditingPostId: (postId: string | null) => void,
  setActiveTab: (tab: Tab) => void,
  homeScrollRef: React.RefObject<ScrollView | null>,
) {
  setPostDraft(draftFromPost(post));
  setEditingPostId(post.id);
  setActiveTab('home');
  requestAnimationFrame(() => homeScrollRef.current?.scrollTo({ animated: true, y: 120 }));
}

function resetPostEditor(
  setPostDraft: (draft: PostDraft) => void,
  setEditingPostId: (postId: string | null) => void,
) {
  setPostDraft(emptyPostDraft);
  setEditingPostId(null);
}

function useHeaderActions({
  markNotificationsReadMutation,
  setActiveTab,
  setPlayerSearch,
  setSearchOpen,
}: {
  markNotificationsReadMutation: WriteMutation;
  setActiveTab: (tab: Tab) => void;
  setPlayerSearch: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
}) {
  return useMemo(
    () => ({
      changeTab: (tab: Tab) => changeTab(tab, setActiveTab, setPlayerSearch, setSearchOpen),
      clearSearch: () => setPlayerSearch(''),
      closeSearch: () => closePlayerSearch(setPlayerSearch, setSearchOpen),
      openNotifications: () => openNotifications({ markNotificationsReadMutation, setActiveTab }),
      openSearch: () => openPlayerSearch(setActiveTab, setSearchOpen),
      openSettings: () => setActiveTab('you'),
    }),
    [markNotificationsReadMutation, setActiveTab, setPlayerSearch, setSearchOpen],
  );
}

function openPlayerSearch(setActiveTab: (tab: Tab) => void, setSearchOpen: (open: boolean) => void) {
  setActiveTab('discover');
  setSearchOpen(true);
}

function closePlayerSearch(setPlayerSearch: (query: string) => void, setSearchOpen: (open: boolean) => void) {
  setPlayerSearch('');
  setSearchOpen(false);
}

function openNotifications({
  markNotificationsReadMutation,
  setActiveTab,
}: {
  markNotificationsReadMutation: WriteMutation;
  setActiveTab: (tab: Tab) => void;
}) {
  setActiveTab('you');
  markNotificationsReadMutation.mutate();
}

async function invalidateHomeData(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  await Promise.all([
    queryClient.resetQueries({ exact: true, queryKey: feedQueryKey }),
    queryClient.invalidateQueries({ queryKey: ['weeklySnapshot', userId] }),
  ]);
}

async function refreshHomeData(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  await invalidateHomeData(queryClient, userId);
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
});
