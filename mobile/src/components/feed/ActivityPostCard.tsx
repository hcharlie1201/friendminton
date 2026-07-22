import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import type { FeedPost } from '../../api/generated';
import { formatDate } from '../../lib/dates';
import { formatElapsedTime } from '../../lib/duration';
import { colors, fonts } from '../ui';
import { PostPhotoGallery } from './PostPhotoGallery';

type Props = {
  canEdit: boolean;
  imageRefreshToken: number;
  onEdit: (post: FeedPost) => void;
  onOpen: (post: FeedPost) => void;
  post: FeedPost;
};

export function ActivityPostCard({ canEdit, imageRefreshToken, onEdit, onOpen, post }: Props) {
  const body = post.body ?? '';
  const imageUrls = post.image_urls ?? [];
  const open = useOpenPostAction(onOpen, post);

  return (
    <Pressable
      accessibilityHint="Opens this activity"
      accessibilityLabel={`${post.display_name}'s ${post.workout_title ?? 'activity'}`}
      accessibilityRole="button"
      onPress={open}
      style={styles.post}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(post.display_name)}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{post.display_name}</Text>
          <Text style={styles.meta}>{post.location ? `${post.location} · ` : ''}{formatDate(post.created_at)}</Text>
        </View>
        {canEdit && (
          <EditPostButton onEdit={onEdit} post={post} />
        )}
      </View>

      {post.workout_id && (
        <View style={styles.workoutSummary}>
          <Ionicons color={colors.primary} name="stopwatch" size={19} />
          <View style={styles.workoutCopy}>
            <Text style={styles.workoutTitle}>{post.workout_title ?? 'Recorded activity'}</Text>
            {post.workout_duration_milliseconds && (
              <Text style={styles.workoutDuration}>{formatElapsedTime(post.workout_duration_milliseconds)} recorded</Text>
            )}
          </View>
        </View>
      )}

      {body.length > 0 && <Text style={styles.body}>{body}</Text>}

      {imageUrls.length > 0 && (
        <PostPhotoGallery imageRefreshToken={imageRefreshToken} imageUrls={imageUrls} />
      )}

      {post.effort && <Effort value={post.effort} />}
    </Pressable>
  );
}

function EditPostButton({ onEdit, post }: { onEdit: (post: FeedPost) => void; post: FeedPost }) {
  const edit = useEditPostAction(onEdit, post);
  return (
    <Pressable accessibilityLabel="Edit post" hitSlop={10} onPress={edit} style={styles.editButton}>
      <Ionicons color={colors.textMuted} name="ellipsis-horizontal" size={22} />
    </Pressable>
  );
}

function useEditPostAction(onEdit: (post: FeedPost) => void, post: FeedPost) {
  return useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
    onEdit(post);
  }, [onEdit, post]);
}

function useOpenPostAction(onOpen: (post: FeedPost) => void, post: FeedPost) {
  return useCallback(() => {
    onOpen(post);
  }, [onOpen, post]);
}

function Effort({ value }: { value: number }) {
  return (
    <View style={styles.effort}>
      <Text style={styles.effortLabel}>MATCH EFFORT</Text>
      <View style={styles.effortBars}>
        {[2, 4, 6, 8, 10].map((threshold) => (
          <View key={threshold} style={[styles.effortBar, value >= threshold && styles.effortBarActive]} />
        ))}
      </View>
      <Text style={styles.effortValue}>{effortLabel(value)}</Text>
    </View>
  );
}

function effortLabel(value: number) {
  if (value >= 9) return 'All out';
  if (value >= 7) return 'Hard';
  if (value >= 5) return 'Steady';
  return 'Easy';
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  post: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.background,
    borderBottomWidth: 8,
    gap: 14,
    paddingVertical: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: {
    color: colors.textOnPrimary,
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 16,
    fontWeight: '900',
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
    paddingHorizontal: 20,
  },
  workoutSummary: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  workoutCopy: { flex: 1 },
  workoutTitle: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
  workoutDuration: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' },
  editButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  effort: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    paddingTop: 12,
  },
  effortLabel: {
    color: colors.textMuted,
    fontFamily: fonts.black,
    fontSize: 10,
    fontWeight: '900',
  },
  effortBars: { flex: 1, flexDirection: 'row', gap: 3 },
  effortBar: { backgroundColor: colors.border, borderRadius: 2, flex: 1, height: 5 },
  effortBarActive: { backgroundColor: colors.primary },
  effortValue: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
});
