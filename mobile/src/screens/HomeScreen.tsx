import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
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
import { apiData, apiSuccess, authHeaders } from '../api/runtime';
import { useSession } from '../auth/session';
import { errorMessage } from '../common/errors';
import {
  AppHeader,
  BottomTabBar,
  HomeContent,
  InlineLoading,
  type DiscoveryPreferences,
  type DiscoveryLocation,
  type HomeActions,
  type SkillLevel,
  type Tab,
} from '../components/home';
import { Screen, colors } from '../components/ui';
import {
  draftFromPost,
  emptyPostDraft,
  imageUrlForLogs,
  postImageUrl,
  type PostDraft,
} from '../features/posts/postDraft';
import { uploadPostPhotos } from '../features/posts/uploads';
import { feedQueryKey } from '../features/posts/feed';
import { type RecordedWorkout, useWorkoutRecorder } from '../features/workouts/useWorkoutRecorder';
import { usePlayerSearch } from '../features/players/usePlayerSearch';
import { useGatheringDiscovery } from '../features/gatherings/useGatheringDiscovery';

type WriteMutation = {
  mutate: () => void;
};

const feedPageSize = 20;
const feedLoadAheadDistance = 320;

function useDiscoveryPreferences() {
  const [location, setLocation] = useState<DiscoveryLocation>({
    city: 'Oakland',
    latitude: 37.8044,
    longitude: -122.2712,
  });
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const apply = useCallback((preferences: DiscoveryPreferences) => {
    setLocation({
      city: preferences.city,
      latitude: preferences.latitude,
      longitude: preferences.longitude,
    });
    setSkillLevel(preferences.skillLevel);
  }, []);

  return { apply, ...location, setLocation, skillLevel };
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
  const { city, latitude, longitude, skillLevel } = discoveryPreferences;
  const [playerSearch, setPlayerSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [workoutTitle, setWorkoutTitle] = useState('Doubles ladder night');
  const [recordedWorkoutId, setRecordedWorkoutId] = useState<string | null>(null);
  const [postDraft, setPostDraft] = useState<PostDraft>(emptyPostDraft);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const workoutRecorder = useWorkoutRecorder();
  const homeRefresh = useHomeRefresh(queryClient, currentUser.id);
  const openPost = usePostNavigation();
  const openGathering = useGatheringDetailNavigation();
  const openPlayer = usePlayerProfileNavigation();
  const openGatheringCreator = useGatheringCreatorNavigation(city);

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
  const gatheringsQuery = useGatheringDiscovery({
    city,
    enabled: activeTab === 'discover' || activeTab === 'groups',
    latitude,
    longitude,
    skillLevel,
    userId: currentUser.id,
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
      apiData<WeeklySnapshot>(getApiEngagementWeeklySnapshot({
        headers: authHeaders(currentUser.id),
      })),
  });
  const notificationsQuery = useQuery({
    queryKey: ['notifications', currentUser.id],
    queryFn: () =>
      apiData<Notification[]>(getApiEngagementNotifications({
        headers: authHeaders(currentUser.id),
      })),
  });
  const unreadNotificationsQuery = useQuery({
    queryKey: ['notifications', 'unreadCount', currentUser.id],
    enabled: notificationsQuery.isSuccess,
    queryFn: () =>
      apiData<UnreadNotificationCount>(getApiEngagementNotificationsUnreadCount({
        headers: authHeaders(currentUser.id),
      })),
  });
  const gameInvitesQuery = useQuery({
    queryKey: ['gameInvites', city, skillLevel],
    queryFn: () =>
      apiData<GameInvite[]>(getApiGameInvites({
        query: {
          city,
          skill_level: skillLevel ?? undefined,
        },
      })),
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
  const markNotificationsReadMutation = useMutation({
    mutationFn: () =>
      apiSuccess(postApiEngagementNotificationsRead({
        headers: authHeaders(currentUser.id),
      })),
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
    gatheringsQuery.isFetching ||
    (feedQuery.isFetching && !feedQuery.isFetchingNextPage) ||
    snapshotQuery.isFetching ||
    gameInvitesQuery.isFetching ||
    createPostMutation.isPending ||
    markNotificationsReadMutation.isPending;
  const actions = useHomeActions({
    createPostMutation,
    discardWorkout: workoutRecorder.reset,
    endWorkout: workoutRecorder.end,
    pauseWorkout: workoutRecorder.pause,
    openGathering,
    openPlayer,
    openPost,
    openGatheringCreator,
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
        refreshControl={supportsPullToRefresh(activeTab) ? (
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={homeRefresh.refresh}
            refreshing={homeRefresh.isRefreshing}
            tintColor={colors.primary}
            title={pullToRefreshTitle(activeTab)}
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
          latitude={latitude}
          longitude={longitude}
          currentUser={currentUser}
          editingPostId={editingPostId}
          feed={feed}
          feedRefreshToken={homeRefresh.imageRefreshToken}
          gameInvites={gameInvites}
          gatherings={gatheringsQuery.gatherings}
          notifications={notifications}
          onLocationChange={discoveryPreferences.setLocation}
          onPostDraftChange={setPostDraft}
          onRetryPlayerSearch={playersQuery.refetch}
          players={players}
          playerSearchQuery={playersQuery.effectiveQuery}
          playerSearchHasError={playersQuery.isError}
          postDraft={postDraft}
          postIsSaving={createPostMutation.isPending}
          setWorkoutTitle={setWorkoutTitle}
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
  const response = await apiData<FeedPage | FeedPost[]>(getApiPostsFeed({
    query: {
      cursor: pageParam,
      limit: feedPageSize,
    },
  }));
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
  Alert.alert('Friendminton', errorMessage(error));
}

function requireSessionUser(user: ReturnType<typeof useSession>['user']) {
  if (!user) {
    throw new Error('HomeScreen requires an authenticated session');
  }

  return user;
}

function useHomeActions({
  createPostMutation,
  discardWorkout,
  endWorkout,
  pauseWorkout,
  openGathering,
  openPlayer,
  openPost,
  openGatheringCreator,
  resumeWorkout,
  setActiveTab,
  setEditingPostId,
  setPostDraft,
  setRecordedWorkoutId,
  signOut,
  startWorkout,
  homeScrollRef,
}: {
  createPostMutation: WriteMutation;
  discardWorkout: () => void;
  endWorkout: () => void;
  pauseWorkout: () => void;
  openGathering: (gatheringId: string) => void;
  openPlayer: (playerId: string) => void;
  openPost: (post: FeedPost) => void;
  openGatheringCreator: () => void;
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
      createGathering: openGatheringCreator,
      createPost: () => createPostMutation.mutate(),
      discardWorkout: () => resetWorkoutDraft(discardWorkout, setPostDraft, setRecordedWorkoutId),
      editPost: (post: FeedPost) =>
        beginPostEdit(post, setPostDraft, setEditingPostId, setActiveTab, homeScrollRef),
      endWorkout,
      openGathering,
      openPlayer,
      openPost,
      pauseWorkout,
      resumeWorkout,
      signOut: () => void signOut(),
      startWorkout: () => beginWorkout(startWorkout, setPostDraft, setEditingPostId, setRecordedWorkoutId),
    }),
    [
      createPostMutation,
      discardWorkout,
      endWorkout,
      openGathering,
      openPlayer,
      openPost,
      openGatheringCreator,
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

function useGatheringCreatorNavigation(city: string) {
  const router = useRouter();
  return useCallback(() => {
    router.push({ pathname: '/gatherings/new', params: { city } });
  }, [city, router]);
}

function useGatheringDetailNavigation() {
  const router = useRouter();
  return useCallback((gatheringId: string) => {
    router.push({ pathname: '/gatherings/[gatheringId]', params: { gatheringId } });
  }, [router]);
}

function usePlayerProfileNavigation() {
  const router = useRouter();
  return useCallback((playerId: string) => {
    router.push({ pathname: '/players/[playerId]', params: { playerId } });
  }, [router]);
}

function usePostNavigation() {
  const router = useRouter();
  return useCallback((post: FeedPost) => {
    router.push({ pathname: '/posts/[postId]', params: { postId: post.id } });
  }, [router]);
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
    return apiData(putApiPosts({
      body: { ...commonBody, id: postId, workout_id: draft.workoutId },
      headers,
    }));
  }

  if (!recordedWorkout) {
    throw new Error('Record and stop a workout before creating an activity post.');
  }

  let workoutId = recordedWorkoutId;
  if (!workoutId) {
    const workout = await apiData<Workout>(postApiWorkouts({
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
    }));
    workoutId = workout.id;
    setRecordedWorkoutId(workoutId);
  }

  return apiData(postApiPosts({ body: { ...commonBody, workout_id: workoutId }, headers }));
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
  await Promise.all([
    invalidateHomeData(queryClient, userId),
    queryClient.invalidateQueries({ queryKey: ['players'] }),
    queryClient.invalidateQueries({ queryKey: ['gatherings'] }),
    queryClient.invalidateQueries({ queryKey: ['gameInvites'] }),
  ]);
}

function supportsPullToRefresh(tab: Tab) {
  return tab === 'home' || tab === 'discover';
}

function pullToRefreshTitle(tab: Tab) {
  return tab === 'discover' ? 'Refreshing discoveries...' : 'Refreshing activity...';
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
});
