import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getApiGameInvites,
  getApiPostsFeed,
  getApiUsers,
  postApiGameInvites,
  postApiPosts,
  postApiWorkouts,
  type ErrorBody,
  type FeedPost,
  type GameInvite,
  type User,
} from '../api/generated';
import { client as generatedClient } from '../api/generated/client.gen';
import { apiBaseUrl, devUserId } from '../config';
import { PillButton } from '../components/PillButton';

type Tab = 'discover' | 'feed' | 'workouts' | 'games';
type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'competitive';
type ApiResult<T> = {
  data?: T;
  error?: ErrorBody;
  response?: Response;
};
type WriteMutation = {
  mutate: () => void;
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

generatedClient.setConfig({ baseUrl: apiBaseUrl });

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'discover', label: 'Discover' },
  { key: 'feed', label: 'Feed' },
  { key: 'workouts', label: 'Track' },
  { key: 'games', label: 'Games' },
];

const skillLevels: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'competitive'];

export function HomeScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('discover');
  const [city, setCity] = useState('Oakland');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');
  const [workoutTitle, setWorkoutTitle] = useState('Doubles ladder night');
  const [postBody, setPostBody] = useState('Footwork finally clicked tonight.');

  const canWrite = Boolean(devUserId);
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
    canWrite,
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Friendminton</Text>
            <Text style={styles.title}>Find your next rally.</Text>
          </View>
          <View style={[styles.statusDot, healthQuery.data && styles.statusOnline]} />
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusText}>{statusLabel}</Text>
          <Text style={styles.baseUrl} numberOfLines={1}>
            {apiBaseUrl}
          </Text>
        </View>

        <View style={styles.filters}>
          <TextInput
            autoCapitalize="words"
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor="#7B8794"
            style={styles.input}
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
              <Pressable
                accessibilityRole="button"
                onPress={actions.createGameInvite}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Create tomorrow's doubles invite</Text>
              </Pressable>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  children,
  emptyText,
  itemCount,
  title,
}: {
  children: React.ReactNode;
  emptyText?: string;
  itemCount: number;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.count}>{itemCount}</Text>
      </View>
      {itemCount === 0 && emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null}
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Composer({
  buttonLabel,
  onChangeText,
  onSubmit,
  placeholder,
  value,
}: {
  buttonLabel: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.composer}>
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7B8794"
        style={styles.composerInput}
        value={value}
      />
      <Pressable accessibilityRole="button" onPress={onSubmit} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
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

function useHomeActions({
  canWrite,
  createGameInviteMutation,
  createPostMutation,
  createWorkoutMutation,
}: {
  canWrite: boolean;
  createGameInviteMutation: WriteMutation;
  createPostMutation: WriteMutation;
  createWorkoutMutation: WriteMutation;
}) {
  return useMemo(
    () => ({
      createGameInvite: () => createGameInvite({ canWrite, mutation: createGameInviteMutation }),
      createPost: () => createPost({ canWrite, mutation: createPostMutation }),
      createWorkout: () => createWorkout({ canWrite, mutation: createWorkoutMutation }),
    }),
    [canWrite, createGameInviteMutation, createPostMutation, createWorkoutMutation],
  );
}

function createWorkout({ canWrite, mutation }: { canWrite: boolean; mutation: WriteMutation }) {
  if (!canWrite) {
    Alert.alert('Set EXPO_PUBLIC_DEV_USER_ID to create workouts.');
    return;
  }

  mutation.mutate();
}

function createPost({ canWrite, mutation }: { canWrite: boolean; mutation: WriteMutation }) {
  if (!canWrite) {
    Alert.alert('Set EXPO_PUBLIC_DEV_USER_ID to post to the feed.');
    return;
  }

  mutation.mutate();
}

function createGameInvite({ canWrite, mutation }: { canWrite: boolean; mutation: WriteMutation }) {
  if (!canWrite) {
    Alert.alert('Set EXPO_PUBLIC_DEV_USER_ID to create game invites.');
    return;
  }

  mutation.mutate();
}

function authHeaders() {
  return devUserId ? { 'x-user-id': devUserId } : undefined;
}

function unwrap<T>({ data, error, response }: ApiResult<T>) {
  if (error) {
    throw new ApiError(error.error ?? `Request failed with status ${response?.status ?? 'unknown'}`, response?.status);
  }

  if (response && !response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  if (data === undefined) {
    throw new ApiError('Request did not return data', response?.status);
  }

  return data;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F4ED',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  eyebrow: {
    color: '#637083',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#101820',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 35,
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
  input: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6DDE6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: '#101820',
    fontSize: 16,
    fontWeight: '700',
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
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#101820',
    fontSize: 20,
    fontWeight: '900',
  },
  count: {
    minWidth: 28,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#DCE8E2',
    color: '#143D33',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
  },
  empty: {
    color: '#637083',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1E5EA',
    backgroundColor: '#FFFFFF',
    padding: 14,
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
  composer: {
    gap: 8,
  },
  composerInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6DDE6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: '#101820',
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#143D33',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
