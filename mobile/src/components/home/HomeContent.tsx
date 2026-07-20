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
import { formatElapsedTime, type WorkoutRecorderPhase } from '../../features/workouts/useWorkoutRecorder';
import { Button, Section } from '../ui';
import { DiscoveryFilters } from './DiscoveryFilters';
import { GameInviteCard } from './GameInviteCard';
import { PlayerSearchResults } from './PlayerSearchResults';
import { SettingsPanel } from './SettingsPanel';
import type { DiscoveryPreferences, SkillLevel, Tab } from './types';
import { WeeklySnapshot } from './WeeklySnapshot';
import { WorkoutRecorder } from './WorkoutRecorder';

export type HomeActions = {
  cancelPostEdit: () => void;
  createGameInvite: () => void;
  createPost: () => void;
  discardWorkout: () => void;
  editPost: (post: FeedPost) => void;
  endWorkout: () => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  signOut: () => void;
  startWorkout: () => void;
};

type Props = {
  actions: HomeActions;
  activeTab: Tab;
  feed: FeedPost[];
  feedRefreshToken: number;
  gameInvites: GameInvite[];
  city: string;
  currentUser: Pick<User, 'id' | 'display_name' | 'email'>;
  editingPostId: string | null;
  notifications: Notification[];
  onCityChange: (city: string) => void;
  onDiscoveryPreferencesChange: (preferences: DiscoveryPreferences) => void;
  players: Player[];
  onPostDraftChange: (draft: PostDraft) => void;
  onRetryPlayerSearch: () => void;
  postDraft: PostDraft;
  postIsSaving: boolean;
  playerSearchQuery: string;
  playerSearchHasError: boolean;
  setWorkoutTitle: (value: string) => void;
  skillLevel: SkillLevel | null;
  snapshot?: WeeklySnapshotData;
  workoutElapsedMilliseconds: number;
  workoutPhase: WorkoutRecorderPhase;
  workoutTitle: string;
};

export function HomeContent({
  actions,
  activeTab,
  city,
  currentUser,
  editingPostId,
  feed,
  feedRefreshToken,
  gameInvites,
  notifications,
  onCityChange,
  onDiscoveryPreferencesChange,
  players,
  onPostDraftChange,
  onRetryPlayerSearch,
  postDraft,
  postIsSaving,
  playerSearchQuery,
  playerSearchHasError,
  setWorkoutTitle,
  skillLevel,
  snapshot,
  workoutElapsedMilliseconds,
  workoutPhase,
  workoutTitle,
}: Props) {
  if (activeTab === 'discover') {
    return (
      <>
        <DiscoveryFilters city={city} onApply={onDiscoveryPreferencesChange} skillLevel={skillLevel} />
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
      <Section title={workoutPhase === 'review' ? 'Save activity' : 'Record activity'} itemCount={workoutPhase === 'review' ? 2 : 1}>
        <WorkoutRecorder
          elapsedMilliseconds={workoutElapsedMilliseconds}
          onDiscard={actions.discardWorkout}
          onEnd={actions.endWorkout}
          onPause={actions.pauseWorkout}
          onResume={actions.resumeWorkout}
          onStart={actions.startWorkout}
          onTitleChange={setWorkoutTitle}
          phase={workoutPhase}
          title={workoutTitle}
        />
        {workoutPhase === 'review' && (
          <PostComposer
            allowEmpty
            contextLabel={`${formatElapsedTime(workoutElapsedMilliseconds)} recorded`}
            draft={postDraft}
            eyebrow="SAVE ACTIVITY"
            isEditing={false}
            isSaving={postIsSaving}
            onCancelEdit={actions.cancelPostEdit}
            onChange={onPostDraftChange}
            onSubmit={actions.createPost}
            submitLabel="Save & post activity"
            title="How did it go?"
          />
        )}
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
        onSignOut={actions.signOut}
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
      {editingPostId !== null && (
        <PostComposer
          draft={postDraft}
          isEditing
          isSaving={postIsSaving}
          onCancelEdit={actions.cancelPostEdit}
          onChange={onPostDraftChange}
          onSubmit={actions.createPost}
        />
      )}
      {feed.map((post) => (
        <ActivityPostCard
          canEdit={post.user_id === currentUser.id}
          imageRefreshToken={feedRefreshToken}
          key={post.id}
          onEdit={actions.editPost}
          post={post}
        />
      ))}
    </>
  );
}
