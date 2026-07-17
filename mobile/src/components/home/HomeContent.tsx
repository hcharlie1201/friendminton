import type { FeedPost, GameInvite, Notification, User, WeeklySnapshot as WeeklySnapshotData } from '../../api/generated';
import { ActivityPostCard } from '../feed/ActivityPostCard';
import { Button, Composer, Section } from '../ui';
import { DiscoveryFilters } from './DiscoveryFilters';
import { GameInviteCard } from './GameInviteCard';
import { PlayerCard } from './PlayerCard';
import { SettingsPanel } from './SettingsPanel';
import type { SkillLevel, Tab } from './types';
import { WeeklySnapshot } from './WeeklySnapshot';
import { WorkoutQuickLogCard } from './WorkoutQuickLogCard';

export type HomeActions = {
  createGameInvite: () => void;
  createPost: () => void;
  createWorkout: () => void;
};

type Props = {
  actions: HomeActions;
  activeTab: Tab;
  feed: FeedPost[];
  gameInvites: GameInvite[];
  city: string;
  currentUser: Pick<User, 'display_name' | 'email'>;
  notifications: Notification[];
  onCityChange: (city: string) => void;
  onSignOut: () => void;
  onSkillLevelChange: (skillLevel: SkillLevel) => void;
  players: User[];
  postBody: string;
  setPostBody: (value: string) => void;
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
  feed,
  gameInvites,
  notifications,
  onCityChange,
  onSignOut,
  onSkillLevelChange,
  players,
  postBody,
  setPostBody,
  setWorkoutTitle,
  skillLevel,
  snapshot,
  workoutTitle,
}: Props) {
  if (activeTab === 'discover') {
    return (
      <>
        <DiscoveryFilters onSkillLevelChange={onSkillLevelChange} skillLevel={skillLevel} />
        <Section title="Players nearby" emptyText="No players found yet." itemCount={players.length}>
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </Section>
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
      <Composer
        buttonLabel="Post"
        onChangeText={setPostBody}
        onSubmit={actions.createPost}
        placeholder="Share a workout note"
        value={postBody}
      />
      {feed.map((post) => (
        <ActivityPostCard key={post.id} post={post} />
      ))}
    </>
  );
}
