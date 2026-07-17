import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getApiGameInvites,
  getApiPostsFeed,
  getApiUsers,
  postApiGameInvites,
  postApiPosts,
  postApiWorkouts,
  type FeedPost,
  type GameInvite,
  type User,
} from '../api/generated';
import { apiBaseUrl } from '../config';
import { authHeaders, unwrap } from '../api/runtime';
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

type WriteMutation = {
  mutate: () => void;
};

export function HomeScreen() {
  const queryClient = useQueryClient();
  const { signOut, user } = useSession();
  const currentUser = requireSessionUser(user);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [city, setCity] = useState('Oakland');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');
  const [workoutTitle, setWorkoutTitle] = useState('Doubles ladder night');
  const [postBody, setPostBody] = useState('Footwork finally clicked tonight.');

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
      await queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const createPostMutation = useMutation({
    mutationFn: () =>
      postApiPosts({
        body: { body: postBody.trim() || 'Great hit today.' },
        headers: authHeaders(currentUser.id),
      }).then(unwrap),
    onError: showError,
    onSuccess: async () => {
      setActiveTab('home');
      await queryClient.invalidateQueries({ queryKey: ['feed'] });
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
      await queryClient.invalidateQueries({ queryKey: ['gameInvites'] });
    },
  });
  const players = playersQuery.data ?? [];
  const feed = feedQuery.data ?? [];
  const gameInvites = gameInvitesQuery.data ?? [];
  const isLoading =
    healthQuery.isLoading ||
    playersQuery.isFetching ||
    feedQuery.isFetching ||
    gameInvitesQuery.isFetching ||
    createWorkoutMutation.isPending ||
    createPostMutation.isPending ||
    createGameInviteMutation.isPending;
  const actions = useHomeActions({
    createGameInviteMutation,
    createPostMutation,
    createWorkoutMutation,
  });

  return (
    <Screen>
      <AppHeader activeTab={activeTab} onOpenSettings={() => setActiveTab('you')} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading && <InlineLoading label="Refreshing court intel..." />}
        <HomeContent
          actions={actions}
          activeTab={activeTab}
          city={city}
          currentUser={currentUser}
          feed={feed}
          gameInvites={gameInvites}
          onCityChange={setCity}
          onSignOut={() => void signOut()}
          onSkillLevelChange={setSkillLevel}
          players={players}
          postBody={postBody}
          setPostBody={setPostBody}
          setWorkoutTitle={setWorkoutTitle}
          skillLevel={skillLevel}
          workoutTitle={workoutTitle}
        />
      </ScrollView>

      <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
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
}: {
  createGameInviteMutation: WriteMutation;
  createPostMutation: WriteMutation;
  createWorkoutMutation: WriteMutation;
}) {
  return useMemo(
    () => ({
      createGameInvite: () => createGameInviteMutation.mutate(),
      createPost: () => createPostMutation.mutate(),
      createWorkout: () => createWorkoutMutation.mutate(),
    }),
    [createGameInviteMutation, createPostMutation, createWorkoutMutation],
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
});
