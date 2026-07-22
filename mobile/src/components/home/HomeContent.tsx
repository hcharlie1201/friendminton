import type {
  FeedPost,
  GameInvite,
  Gathering,
  Notification,
  Player,
  User,
  WeeklySnapshot as WeeklySnapshotData,
} from '../../api/generated';
import { StyleSheet, View } from 'react-native';
import { ActivityPostCard } from '../feed/ActivityPostCard';
import { DiscoverHub } from '../discovery';
import { DiscoverGatheringSections, HostedGatheringList } from '../gatherings';
import { PostComposer } from '../feed/PostComposer';
import type { PostDraft } from '../../features/posts/postDraft';
import { Button, Section } from '../ui';
import { GameInviteCard } from './GameInviteCard';
import { PlayerSearchResults } from './PlayerSearchResults';
import { SettingsPanel } from './SettingsPanel';
import type { DiscoveryLocation, Tab } from './types';
import { WeeklySnapshot } from './WeeklySnapshot';

export type HomeActions = {
  cancelPostEdit: () => void;
  createGathering: () => void;
  createPost: () => void;
  editPost: (post: FeedPost) => void;
  openGathering: (gatheringId: string) => void;
  openPlayer: (playerId: string) => void;
  openPost: (post: FeedPost) => void;
  signOut: () => void;
};

type Props = {
  actions: HomeActions;
  activeTab: Tab;
  feed: FeedPost[];
  feedRefreshToken: number;
  gameInvites: GameInvite[];
  gatherings: Gathering[];
  hostedGatherings: Gathering[];
  city: string;
  latitude: number | null;
  longitude: number | null;
  currentUser: Pick<User, 'id' | 'display_name' | 'email'>;
  editingPostId: string | null;
  notifications: Notification[];
  onLocationChange: (location: DiscoveryLocation) => void;
  players: Player[];
  onPostDraftChange: (draft: PostDraft) => void;
  onRetryPlayerSearch: () => void;
  postDraft: PostDraft;
  postIsSaving: boolean;
  playerSearchQuery: string;
  playerSearchHasError: boolean;
  snapshot?: WeeklySnapshotData;
};

export function HomeContent({
  actions,
  activeTab,
  city,
  latitude,
  longitude,
  currentUser,
  editingPostId,
  feed,
  feedRefreshToken,
  gameInvites,
  gatherings,
  hostedGatherings,
  notifications,
  onLocationChange,
  players,
  onPostDraftChange,
  onRetryPlayerSearch,
  postDraft,
  postIsSaving,
  playerSearchQuery,
  playerSearchHasError,
  snapshot,
}: Props) {
  if (activeTab === 'discover') {
    return (
      <>
        <DiscoverHub
          city={city}
          gatherings={gatherings}
          latitude={latitude}
          longitude={longitude}
          onCreateGathering={actions.createGathering}
          onOpenGathering={actions.openGathering}
        />
        {playerSearchQuery.length > 0 && (
          <PlayerSearchResults
            hasError={playerSearchHasError}
            onOpenPlayer={actions.openPlayer}
            onRetry={onRetryPlayerSearch}
            players={players}
            query={playerSearchQuery}
          />
        )}
      </>
    );
  }

  if (activeTab === 'groups') {
    return (
      <>
        <Section
          title="Sessions & socials"
          emptyText="Nothing nearby yet. Host the first gathering."
          itemCount={gatherings.length}
        >
          <Button icon="add-circle" onPress={actions.createGathering}>
            Host a session or social
          </Button>
          <DiscoverGatheringSections gatherings={gatherings} onOpenGathering={actions.openGathering} />
        </Section>
        {gameInvites.length > 0 && (
          <Section title="Game invites" itemCount={gameInvites.length}>
            {gameInvites.map((invite) => (
              <GameInviteCard invite={invite} key={invite.id} />
            ))}
          </Section>
        )}
      </>
    );
  }

  if (activeTab === 'you') {
    return (
      <View style={styles.fullWidth}>
        <SettingsPanel
          city={city}
          displayName={currentUser.display_name}
          email={currentUser.email}
          notifications={notifications}
          onLocationChange={onLocationChange}
          onSignOut={actions.signOut}
        >
          <HostedGatheringList
            gatherings={hostedGatherings}
            onCreateGathering={actions.createGathering}
            onOpenGathering={actions.openGathering}
          />
        </SettingsPanel>
      </View>
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
      <View style={styles.feed}>
        {feed.map((post) => (
          <ActivityPostCard
            canEdit={post.user_id === currentUser.id}
            imageRefreshToken={feedRefreshToken}
            key={post.id}
            onEdit={actions.editPost}
            onOpen={actions.openPost}
            post={post}
          />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  feed: { marginHorizontal: -20 },
  fullWidth: { marginHorizontal: -20, marginTop: -16 },
});
