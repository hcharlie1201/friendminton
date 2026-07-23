import type {
  BadmintonGroup,
  FeedPost,
  Gathering,
  Notification,
  Player,
  User,
  WeeklySnapshot as WeeklySnapshotData,
} from '../../api/generated';
import { StyleSheet, View } from 'react-native';
import { ActivityPostCard } from '../feed/ActivityPostCard';
import { DiscoverHub } from '../discovery';
import { HostedGatheringList } from '../gatherings';
import { GroupsHub } from '../groups';
import { PostComposer } from '../feed/PostComposer';
import { JoinedGroupsList, PersonalProfileHero } from '../profile';
import type { PostDraft } from '../../features/posts/postDraft';
import { PlayerSearchResults } from './PlayerSearchResults';
import { SettingsPanel } from './SettingsPanel';
import type { DiscoveryLocation, Tab } from './types';
import { WeeklySnapshot } from './WeeklySnapshot';

export type HomeActions = {
  cancelPostEdit: () => void;
  createGathering: () => void;
  createGroup: () => void;
  createPost: () => void;
  editPost: (post: FeedPost) => void;
  openGathering: (gatheringId: string) => void;
  openGroup: (groupId: string) => void;
  openPlayer: (playerId: string) => void;
  openPost: (post: FeedPost) => void;
  signOut: () => void;
};

type Props = {
  actions: HomeActions;
  activeTab: Tab;
  feed: FeedPost[];
  feedRefreshToken: number;
  gatherings: Gathering[];
  hostedGatherings: Gathering[];
  groups: BadmintonGroup[];
  joinedGroups: BadmintonGroup[];
  city: string;
  latitude: number | null;
  longitude: number | null;
  currentUser: Pick<User, 'id' | 'display_name' | 'email'>;
  editingPostId: string | null;
  notifications: Notification[];
  onLocationChange: (location: DiscoveryLocation) => void;
  players: Player[];
  profile?: Player;
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
  gatherings,
  hostedGatherings,
  groups,
  joinedGroups,
  notifications,
  onLocationChange,
  players,
  profile,
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
      <View style={styles.fullWidth}>
        <GroupsHub
          city={city}
          discoveredGroups={groups}
          gatherings={gatherings}
          joinedGroups={joinedGroups}
          onCreateGroup={actions.createGroup}
          onOpenGathering={actions.openGathering}
          onOpenGroup={actions.openGroup}
        />
      </View>
    );
  }

  if (activeTab === 'you') {
    return (
      <View style={styles.fullWidth}>
        <PersonalProfileHero
          displayName={currentUser.display_name}
          groupCount={joinedGroups.length}
          player={profile}
          snapshot={snapshot}
        />
        <JoinedGroupsList groups={joinedGroups} onOpenGroup={actions.openGroup} />
        <HostedGatheringList
          gatherings={hostedGatherings}
          onCreateGathering={actions.createGathering}
          onOpenGathering={actions.openGathering}
        />
        <SettingsPanel
          city={city}
          email={currentUser.email}
          notifications={notifications}
          onLocationChange={onLocationChange}
          onSignOut={actions.signOut}
        />
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
