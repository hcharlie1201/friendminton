import type {
  FeedPost,
  GameInvite,
  Notification,
  Player,
  User,
  WeeklySnapshot as WeeklySnapshotData,
} from '../../api/generated';
import { ActivityPostCard } from '../feed/ActivityPostCard';
import { PostComposer } from '../feed/PostComposer';
import type { PostDraft } from '../../features/posts/postDraft';
import { Button, Composer, Section } from '../ui';
import { DiscoveryFilters } from './DiscoveryFilters';
import { GameInviteCard } from './GameInviteCard';
import { PlayerSearchResults } from './PlayerSearchResults';
import { SettingsPanel } from './SettingsPanel';
import type { SkillLevel, Tab } from './types';
import { WeeklySnapshot } from './WeeklySnapshot';
import { WorkoutQuickLogCard } from './WorkoutQuickLogCard';

export type HomeActions = {
  createGameInvite: () => void;
  createPost: () => void;
  createWorkout: () => void;
  editPost: (post: FeedPost) => void;
};

type Props = {
  actions: HomeActions;
  activeTab: Tab;
  feed: FeedPost[];
  gameInvites: GameInvite[];
  city: string;
  currentUser: Pick<User, 'id' | 'display_name' | 'email'>;
  editingPostId: string | null;
  notifications: Notification[];
  onCityChange: (city: string) => void;
  onSignOut: () => void;
  onSkillLevelChange: (skillLevel: SkillLevel) => void;
  players: Player[];
  onCancelPostEdit: () => void;
  onPostDraftChange: (draft: PostDraft) => void;
  onRetryPlayerSearch: () => void;
  postDraft: PostDraft;
  postIsSaving: boolean;
  playerSearchQuery: string;
  playerSearchHasError: boolean;
  setWorkoutTitle: (value: string) => void;
  skillLevel: SkillLevel;
  snapshot?: WeeklySnapshotData;
  workoutTitle: string;
};

export function HomeContent({
  actions,
  activeTab,
  city,
  currentUser,
  editingPostId,
  feed,
  gameInvites,
  notifications,
  onCityChange,
  onSignOut,
  onSkillLevelChange,
  players,
  onCancelPostEdit,
  onPostDraftChange,
  onRetryPlayerSearch,
  postDraft,
  postIsSaving,
  playerSearchQuery,
  playerSearchHasError,
  setWorkoutTitle,
  skillLevel,
  snapshot,
  workoutTitle,
}: Props) {
  if (activeTab === 'discover') {
    return (
      <>
        <DiscoveryFilters onSkillLevelChange={onSkillLevelChange} skillLevel={skillLevel} />
        <PlayerSearchResults
          hasError={playerSearchHasError}
          onRetry={onRetryPlayerSearch}
          players={players}
          query={playerSearchQuery}
        />
      </>
    );
  }

  if (activeTab === 'record') {
    return (
      <Section title="Track workout" itemCount={1}>
        <Composer
          buttonLabel="Save workout"
          onChangeText={setWorkoutTitle}
          onSubmit={actions.createWorkout}
          placeholder="Workout title"
          value={workoutTitle}
        />
        <WorkoutQuickLogCard />
      </Section>
    );
  }

  if (activeTab === 'groups') {
    return (
      <Section title="Game invites" emptyText="No invites found yet." itemCount={gameInvites.length}>
        <Button icon="add-circle" onPress={actions.createGameInvite}>
          Create tomorrow's doubles invite
        </Button>
        {gameInvites.map((invite) => (
          <GameInviteCard invite={invite} key={invite.id} />
        ))}
      </Section>
    );
  }

  if (activeTab === 'you') {
    return (
      <SettingsPanel
        city={city}
        displayName={currentUser.display_name}
        email={currentUser.email}
        notifications={notifications}
        onCityChange={onCityChange}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <>
      <WeeklySnapshot
        activities={snapshot?.activities ?? 0}
        games={snapshot?.games ?? 0}
        minutes={snapshot?.duration_minutes ?? 0}
      />
      <PostComposer
        draft={postDraft}
        isEditing={editingPostId !== null}
        isSaving={postIsSaving}
        onCancelEdit={onCancelPostEdit}
        onChange={onPostDraftChange}
        onSubmit={actions.createPost}
      />
      {feed.map((post) => (
        <ActivityPostCard
          canEdit={post.user_id === currentUser.id}
          key={post.id}
          onEdit={actions.editPost}
          post={post}
        />
      ))}
    </>
  );
}
