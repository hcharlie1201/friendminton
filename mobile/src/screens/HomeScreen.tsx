import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { PillButton } from '../components/PillButton';
import { Button, Card, Composer, PageHeader, Screen, Section, TextField } from '../components/ui';

type Tab = 'discover' | 'feed' | 'workouts' | 'games';
type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'competitive';
type WriteMutation = {
  mutate: () => void;
};

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'discover', label: 'Discover' },
  { key: 'feed', label: 'Feed' },
  { key: 'workouts', label: 'Track' },
  { key: 'games', label: 'Games' },
];

const skillLevels: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'competitive'];

export function HomeScreen() {
  const queryClient = useQueryClient();
  const { signOut, user } = useSession();
  const currentUser = requireSessionUser(user);
  const [activeTab, setActiveTab] = useState<Tab>('discover');
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
      setActiveTab('feed');
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
      setActiveTab('games');
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

  const statusLabel = useMemo(() => {
    if (healthQuery.isLoading) return 'Checking API';
    if (healthQuery.data) return 'API online';
    return 'API offline';
  }, [healthQuery.data, healthQuery.isLoading]);

  return (
    <Screen>
        <View style={styles.header}>
          <PageHeader
            action={
              <Button onPress={() => void signOut()} variant="secondary">
                Sign out
              </Button>
            }
            eyebrow="Friendminton"
            title="Find your next rally."
          />
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusTextRow}>
            <View style={[styles.statusDot, healthQuery.data && styles.statusOnline]} />
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
          <Text style={styles.baseUrl} numberOfLines={1}>
            {currentUser.display_name} · {apiBaseUrl}
          </Text>
        </View>

        <View style={styles.filters}>
          <TextField
            autoCapitalize="words"
            onChangeText={setCity}
            placeholder="City"
            value={city}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillScroller}>
            <View style={styles.skillRow}>
              {skillLevels.map((level) => (
                <PillButton
                  active={skillLevel === level}
                  key={level}
                  onPress={() => setSkillLevel(level)}
                >
                  {level}
                </PillButton>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <Pressable
              accessibilityRole="button"
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#143D33" />
              <Text style={styles.muted}>Refreshing court intel...</Text>
            </View>
          )}

          {activeTab === 'discover' && (
            <Section title="Players nearby" emptyText="No players found yet." itemCount={players.length}>
              {players.map((player) => (
                <Card key={player.id}>
                  <Text style={styles.cardTitle}>{player.display_name}</Text>
                  <Text style={styles.cardMeta}>
                    {player.skill_level} {player.city ? `in ${player.city}` : ''}
                  </Text>
                  {player.bio && <Text style={styles.cardBody}>{player.bio}</Text>}
                </Card>
              ))}
            </Section>
          )}

          {activeTab === 'feed' && (
            <Section title="Workout feed" emptyText="No posts yet." itemCount={feed.length}>
              <Composer
                buttonLabel="Post"
                onChangeText={setPostBody}
                onSubmit={actions.createPost}
                placeholder="Share a workout note"
                value={postBody}
              />
              {feed.map((post) => (
                <Card key={post.id}>
                  <Text style={styles.cardTitle}>{post.display_name}</Text>
                  <Text style={styles.cardBody}>{post.body}</Text>
                  <Text style={styles.cardMeta}>{formatDate(post.created_at)}</Text>
                </Card>
              ))}
            </Section>
          )}

          {activeTab === 'workouts' && (
            <Section title="Track workout" itemCount={1}>
              <Composer
                buttonLabel="Save workout"
                onChangeText={setWorkoutTitle}
                onSubmit={actions.createWorkout}
                placeholder="Workout title"
                value={workoutTitle}
              />
              <Card>
                <Text style={styles.cardTitle}>Default quick log</Text>
                <Text style={styles.cardBody}>
                  Saves a 75 minute match workout using the temporary dev user header.
                </Text>
              </Card>
            </Section>
          )}

          {activeTab === 'games' && (
            <Section title="Game invites" emptyText="No invites found yet." itemCount={gameInvites.length}>
              <Button onPress={actions.createGameInvite}>Create tomorrow's doubles invite</Button>
              {gameInvites.map((invite) => (
                <Card key={invite.id}>
                  <Text style={styles.cardTitle}>{invite.title}</Text>
                  <Text style={styles.cardMeta}>
                    {invite.venue} · {invite.city}
                  </Text>
                  <Text style={styles.cardBody}>
                    {invite.skill_level} · {invite.max_players} players · {formatDate(invite.starts_at)}
                  </Text>
                </Card>
              ))}
            </Section>
          )}
        </ScrollView>
    </Screen>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#D94F45',
  },
  statusOnline: {
    backgroundColor: '#2F9E6D',
  },
  statusRow: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 3,
  },
  statusTextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  statusText: {
    color: '#263238',
    fontSize: 14,
    fontWeight: '800',
  },
  baseUrl: {
    color: '#637083',
    fontSize: 12,
  },
  filters: {
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  skillScroller: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  skillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#E7E1D6',
  },
  activeTab: {
    backgroundColor: '#101820',
  },
  tabText: {
    color: '#4C5967',
    fontSize: 13,
    fontWeight: '800',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  content: {
    gap: 12,
    padding: 20,
    paddingTop: 6,
    paddingBottom: 36,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
  },
  muted: {
    color: '#637083',
    fontSize: 14,
    fontWeight: '700',
  },
  cardTitle: {
    color: '#101820',
    fontSize: 17,
    fontWeight: '900',
  },
  cardMeta: {
    color: '#637083',
    fontSize: 13,
    fontWeight: '700',
  },
  cardBody: {
    color: '#263238',
    fontSize: 15,
    lineHeight: 21,
  },
});
