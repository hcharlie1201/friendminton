import type {
  BadmintonGroup,
  DiscoveryCategory,
  DiscoveryResult,
  FeedPost,
  Gathering,
  Notification,
  Player,
  User,
  WeeklySnapshot as WeeklySnapshotData,
} from '../../api/generated';
import { StyleSheet, View } from 'react-native';
import { ActivityPostCard } from '../feed/ActivityPostCard';
import { DiscoverHub, UnifiedDiscoveryResults } from '../discovery';
import { HostedGatheringList } from '../gatherings';
import { GroupsHub } from '../groups';
import { PostComposer } from '../feed/PostComposer';
import { JoinedGroupsList, PersonalProfileHero } from '../profile';
import type { PostDraft } from '../../features/posts/postDraft';
import { DiscoveryFilters } from './DiscoveryFilters';
import { SettingsPanel } from './SettingsPanel';
import type { DiscoveryLocation, DiscoveryPreferences, SkillLevel, Tab } from './types';
import { WeeklySnapshot } from './WeeklySnapshot';

export type HomeActions = {
  cancelPostEdit: () => void;
  createGathering: () => void;
  createGroup: () => void;
  createPost: () => void;
  deleteAccount: () => Promise<void>;
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
  filterCity: string;
  latitude: number | null;
  locationEnabled: boolean;
  longitude: number | null;
  currentUser: Pick<User, 'id' | 'display_name' | 'email'>;
  editingPostId: string | null;
  notifications: Notification[];
  onDiscoveryCategoryChange: (category: DiscoveryCategory) => void;
  onDiscoveryPreferencesChange: (preferences: DiscoveryPreferences) => void;
  onLoadMoreDiscovery: () => void;
  onLocationChange: (location: DiscoveryLocation) => void;
  profile?: Player;
  onPostDraftChange: (draft: PostDraft) => void;
  onRetryDiscovery: () => void;
  postDraft: PostDraft;
  postIsSaving: boolean;
  discoveryCategory: DiscoveryCategory;
  discoveryHasError: boolean;
  discoveryHasNextPage: boolean;
  discoveryIsFetchingNextPage: boolean;
  discoveryIsLoading: boolean;
  discoveryItems: DiscoveryResult[];
  discoveryQuery: string;
  skillLevel: SkillLevel | null;
  snapshot?: WeeklySnapshotData;
};

export function HomeContent({
  actions,
  activeTab,
  city,
  filterCity,
  latitude,
  locationEnabled,
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
  onDiscoveryCategoryChange,
  onDiscoveryPreferencesChange,
  onLoadMoreDiscovery,
  onLocationChange,
  profile,
  onPostDraftChange,
  onRetryDiscovery,
  postDraft,
  postIsSaving,
  discoveryCategory,
  discoveryHasError,
  discoveryHasNextPage,
  discoveryIsFetchingNextPage,
  discoveryIsLoading,
  discoveryItems,
  discoveryQuery,
  skillLevel,
  snapshot,
}: Props) {
  if (activeTab === 'discover') {
    return (
      <>
        <DiscoveryFilters
          city={filterCity}
          latitude={latitude}
          locationEnabled={locationEnabled}
          longitude={longitude}
          onApply={onDiscoveryPreferencesChange}
          skillLevel={skillLevel}
        />
        <UnifiedDiscoveryResults
          category={discoveryCategory}
          hasError={discoveryHasError}
          hasNextPage={discoveryHasNextPage}
          isFetchingNextPage={discoveryIsFetchingNextPage}
          isLoading={discoveryIsLoading}
          items={discoveryItems}
          onCategoryChange={onDiscoveryCategoryChange}
          onLoadMore={onLoadMoreDiscovery}
          onOpenGathering={actions.openGathering}
          onOpenGroup={actions.openGroup}
          onOpenPlayer={actions.openPlayer}
          onRetry={onRetryDiscovery}
          query={discoveryQuery}
        />
        <DiscoverHub
          city={city}
          gatherings={gatherings}
          latitude={latitude}
          longitude={longitude}
          onCreateGathering={actions.createGathering}
          onOpenGathering={actions.openGathering}
        />
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
          city={filterCity}
          email={currentUser.email}
          notifications={notifications}
          onAccountDeleted={actions.deleteAccount}
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
        activeDays={snapshot?.active_days_last_28 ?? 0}
        activeWeeks={snapshot?.active_weeks_last_8 ?? 0}
        consistency={snapshot?.consistency_percent ?? 0}
        currentStreak={snapshot?.current_streak_weeks ?? 0}
        games={snapshot?.games ?? 0}
        goal={snapshot?.weekly_goal ?? 1}
        goalProgress={snapshot?.weekly_goal_progress ?? 0}
        longestStreak={snapshot?.longest_streak_weeks ?? 0}
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
