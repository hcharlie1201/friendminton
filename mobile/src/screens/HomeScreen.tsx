import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getApiEngagementNotifications,
  getApiEngagementNotificationsUnreadCount,
  getApiEngagementWeeklySnapshot,
  getApiGameInvites,
  getApiPostsFeed,
  getApiUsers,
  postApiEngagementNotificationsRead,
  postApiGameInvites,
  postApiPosts,
  postApiWorkouts,
  putApiPosts,
  type FeedPost,
  type GameInvite,
  type Notification,
  type UnreadNotificationCount,
  type User,
  type WeeklySnapshot,
} from '../api/generated';
import { apiBaseUrl } from '../config';
import { authHeaders, unwrap, unwrapEmpty } from '../api/runtime';
import { useSession } from '../auth/session';
import {
  AppHeader,
  BottomTabBar,
  HomeContent,
  InlineLoading,
  type HomeActions,
  type SkillLevel,
  type Tab,
} from '../components/home';
import { Screen } from '../components/ui';
import { draftFromPost, emptyPostDraft, type PostDraft } from '../features/posts/postDraft';
import { uploadPostPhotos } from '../features/posts/uploads';

type WriteMutation = {
  mutate: () => void;
};

export function HomeScreen() {
  const queryClient = useQueryClient();
  const homeScrollRef = useRef<ScrollView>(null);
  const { signOut, user } = useSession();
  const currentUser = requireSessionUser(user);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [city, setCity] = useState('Oakland');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');
  const [workoutTitle, setWorkoutTitle] = useState('Doubles ladder night');
  const [postDraft, setPostDraft] = useState<PostDraft>(emptyPostDraft);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch(`${apiBaseUrl}/healthz`).then((response) => response.ok),
    retry: false,
  });
  const playersQuery = useQuery({
    queryKey: ['players', city, skillLevel],
    queryFn: () =>
      getApiUsers({
        query: {
          city,
          skill_level: skillLevel,
        },
      }).then(unwrap<User[]>),
  });
  const feedQuery = useQuery({
    queryKey: ['feed'],
    queryFn: () => getApiPostsFeed().then(unwrap<FeedPost[]>),
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
          skill_level: skillLevel,
        },
      }).then(unwrap<GameInvite[]>),
  });
  const createWorkoutMutation = useMutation({
    mutationFn: () =>
      postApiWorkouts({
        body: {
          title: workoutTitle.trim() || 'Badminton workout',
          workout_type: 'match',
          duration_minutes: 75,
          calories: 430,
          occurred_at: new Date().toISOString(),
        },
        headers: authHeaders(currentUser.id),
      }).then(unwrap),
    onError: showError,
    onSuccess: async () => {
      Alert.alert('Workout saved');
      await invalidateHomeData(queryClient, currentUser.id);
    },
  });
  const createPostMutation = useMutation({
    mutationFn: () =>
      savePost({ draft: postDraft, postId: editingPostId, userId: currentUser.id }),
    onError: showError,
    onSuccess: async () => {
      resetPostEditor(setPostDraft, setEditingPostId);
      setActiveTab('home');
      await invalidateHomeData(queryClient, currentUser.id);
    },
  });
  const createGameInviteMutation = useMutation({
    mutationFn: () =>
      postApiGameInvites({
        body: {
          title: 'Evening doubles',
          venue: 'Downtown Rec Center',
          city,
          starts_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          skill_level: skillLevel,
          max_players: 8,
        },
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
  const feed = feedQuery.data ?? [];
  const gameInvites = gameInvitesQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const unreadNotificationCount = unreadNotificationsQuery.data?.count ?? 0;
  const isLoading =
    healthQuery.isLoading ||
    playersQuery.isFetching ||
    feedQuery.isFetching ||
    snapshotQuery.isFetching ||
    gameInvitesQuery.isFetching ||
    createWorkoutMutation.isPending ||
    createPostMutation.isPending ||
    createGameInviteMutation.isPending ||
    markNotificationsReadMutation.isPending;
  const actions = useHomeActions({
    createGameInviteMutation,
    createPostMutation,
    createWorkoutMutation,
    setActiveTab,
    setEditingPostId,
    setPostDraft,
    homeScrollRef,
  });
  const headerActions = useHeaderActions({
    markNotificationsReadMutation,
    setActiveTab,
  });

  return (
    <Screen>
      <AppHeader
        activeTab={activeTab}
        notificationCount={unreadNotificationCount}
        onOpenNotifications={headerActions.openNotifications}
        onOpenSettings={headerActions.openSettings}
      />

      <ScrollView ref={homeScrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading && <InlineLoading label="Refreshing court intel..." />}
        <HomeContent
          actions={actions}
          activeTab={activeTab}
          city={city}
          currentUser={currentUser}
          editingPostId={editingPostId}
          feed={feed}
          gameInvites={gameInvites}
          notifications={notifications}
          onCityChange={setCity}
          onCancelPostEdit={() => resetPostEditor(setPostDraft, setEditingPostId)}
          onPostDraftChange={setPostDraft}
          onSignOut={() => void signOut()}
          onSkillLevelChange={setSkillLevel}
          players={players}
          postDraft={postDraft}
          postIsSaving={createPostMutation.isPending}
          setWorkoutTitle={setWorkoutTitle}
          skillLevel={skillLevel}
          snapshot={snapshotQuery.data}
          workoutTitle={workoutTitle}
        />
      </ScrollView>

      <BottomTabBar activeTab={activeTab} notificationCount={unreadNotificationCount} onTabChange={setActiveTab} />
    </Screen>
  );
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
  createWorkoutMutation,
  setActiveTab,
  setEditingPostId,
  setPostDraft,
  homeScrollRef,
}: {
  createGameInviteMutation: WriteMutation;
  createPostMutation: WriteMutation;
  createWorkoutMutation: WriteMutation;
  setActiveTab: (tab: Tab) => void;
  setEditingPostId: (postId: string | null) => void;
  setPostDraft: (draft: PostDraft) => void;
  homeScrollRef: React.RefObject<ScrollView | null>;
}) {
  return useMemo(
    () => ({
      createGameInvite: () => createGameInviteMutation.mutate(),
      createPost: () => createPostMutation.mutate(),
      createWorkout: () => createWorkoutMutation.mutate(),
      editPost: (post: FeedPost) =>
        beginPostEdit(post, setPostDraft, setEditingPostId, setActiveTab, homeScrollRef),
    }),
    [
      createGameInviteMutation,
      createPostMutation,
      createWorkoutMutation,
      setActiveTab,
      setEditingPostId,
      setPostDraft,
      homeScrollRef,
    ],
  );
}

async function savePost({ draft, postId, userId }: { draft: PostDraft; postId: string | null; userId: string }) {
  const imageKeys = await uploadPostPhotos(userId, draft.photos);
  const body = {
    body: draft.body.trim(),
    effort: draft.effort,
    image_keys: imageKeys,
    location: draft.location.trim() || null,
  };
  const headers = authHeaders(userId);

  if (postId) {
    return putApiPosts({ body: { ...body, id: postId }, headers }).then(unwrap);
  }

  return postApiPosts({ body, headers }).then(unwrap);
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
}: {
  markNotificationsReadMutation: WriteMutation;
  setActiveTab: (tab: Tab) => void;
}) {
  return useMemo(
    () => ({
      openNotifications: () => openNotifications({ markNotificationsReadMutation, setActiveTab }),
      openSettings: () => setActiveTab('you'),
    }),
    [markNotificationsReadMutation, setActiveTab],
  );
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
    queryClient.invalidateQueries({ queryKey: ['feed'] }),
    queryClient.invalidateQueries({ queryKey: ['weeklySnapshot', userId] }),
  ]);
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
});
