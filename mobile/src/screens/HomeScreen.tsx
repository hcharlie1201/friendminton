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
  putApiPosts,
  type FeedPage,
  type FeedPost,
  type GameInvite,
  type Notification,
  type UnreadNotificationCount,
  type User,
  type WeeklySnapshot,
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
import { usePlayerSearch } from '../features/players/usePlayerSearch';
import { useGatheringDiscovery } from '../features/gatherings/useGatheringDiscovery';
import { useHostedGatherings } from '../features/gatherings/useHostedGatherings';

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
  const [postDraft, setPostDraft] = useState<PostDraft>(emptyPostDraft);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
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
  const hostedGatheringsQuery = useHostedGatherings(currentUser.id, activeTab === 'you');
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
      savePostEdit({
        draft: postDraft,
        postId: editingPostId,
        userId: currentUser.id,
      }),
    onError: showError,
    onSuccess: async () => {
      resetPostEditor(setPostDraft, setEditingPostId);
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
    hostedGatheringsQuery.isFetching ||
    (feedQuery.isFetching && !feedQuery.isFetchingNextPage) ||
    snapshotQuery.isFetching ||
    gameInvitesQuery.isFetching ||
    createPostMutation.isPending ||
    markNotificationsReadMutation.isPending;
  const actions = useHomeActions({
    createPostMutation,
    openGathering,
    openPlayer,
    openPost,
    openGatheringCreator,
    setActiveTab,
    setEditingPostId,
    setPostDraft,
    signOut,
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
            titleColor={colors.textMuted}
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
          hostedGatherings={hostedGatheringsQuery.data ?? []}
          notifications={notifications}
          onLocationChange={discoveryPreferences.setLocation}
          onPostDraftChange={setPostDraft}
          onRetryPlayerSearch={playersQuery.refetch}
          players={players}
          playerSearchQuery={playersQuery.effectiveQuery}
          playerSearchHasError={playersQuery.isError}
          postDraft={postDraft}
          postIsSaving={createPostMutation.isPending}
          snapshot={snapshotQuery.data}
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
  openGathering,
  openPlayer,
  openPost,
  openGatheringCreator,
  setActiveTab,
  setEditingPostId,
  setPostDraft,
  signOut,
  homeScrollRef,
}: {
  createPostMutation: WriteMutation;
  openGathering: (gatheringId: string) => void;
  openPlayer: (playerId: string) => void;
  openPost: (post: FeedPost) => void;
  openGatheringCreator: () => void;
  setActiveTab: (tab: Tab) => void;
  setEditingPostId: (postId: string | null) => void;
  setPostDraft: (draft: PostDraft) => void;
  signOut: () => Promise<void>;
  homeScrollRef: React.RefObject<ScrollView | null>;
}) {
  return useMemo(
    () => ({
      cancelPostEdit: () => resetPostEditor(setPostDraft, setEditingPostId),
      createGathering: openGatheringCreator,
      createPost: () => createPostMutation.mutate(),
      editPost: (post: FeedPost) =>
        beginPostEdit(post, setPostDraft, setEditingPostId, setActiveTab, homeScrollRef),
      openGathering,
      openPlayer,
      openPost,
      signOut: () => void signOut(),
    }),
    [
      createPostMutation,
      openGathering,
      openPlayer,
      openPost,
      openGatheringCreator,
      setActiveTab,
      setEditingPostId,
      setPostDraft,
      signOut,
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

async function savePostEdit({
  draft,
  postId,
  userId,
}: {
  draft: PostDraft;
  postId: string | null;
  userId: string;
}) {
  if (!postId || !draft.workoutId) {
    throw new Error('Only an existing event activity can be edited here.');
  }

  const imageKeys = await uploadPostPhotos(userId, draft.photos);
  const commonBody = {
    body: draft.body.trim(),
    effort: draft.effort,
    image_keys: imageKeys,
    location: draft.location.trim() || null,
  };
  const headers = authHeaders(userId);

  return apiData(putApiPosts({
    body: { ...commonBody, id: postId, workout_id: draft.workoutId },
    headers,
  }));
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
  return tab === 'home' || tab === 'discover' || tab === 'you';
}

function pullToRefreshTitle(tab: Tab) {
  if (tab === 'you') return 'Refreshing your gatherings...';
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
