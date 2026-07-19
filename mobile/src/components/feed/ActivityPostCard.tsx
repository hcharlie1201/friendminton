import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { FeedPost } from '../../api/generated';
import { formatDate } from '../../lib/dates';
import { postImageUrl } from '../../features/posts/postDraft';
import { colors, fonts } from '../ui';

type Props = {
  canEdit: boolean;
  onEdit: (post: FeedPost) => void;
  post: FeedPost;
};

export function ActivityPostCard({ canEdit, onEdit, post }: Props) {
  const body = post.body ?? '';
  const imageUrls = post.image_urls ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(post.display_name)}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{post.display_name}</Text>
          <Text style={styles.meta}>{post.location ? `${post.location} · ` : ''}{formatDate(post.created_at)}</Text>
        </View>
        {canEdit && (
          <Pressable accessibilityLabel="Edit post" hitSlop={10} onPress={() => onEdit(post)} style={styles.editButton}>
            <Ionicons color={colors.muted} name="ellipsis-horizontal" size={22} />
          </Pressable>
        )}
      </View>

      {body.length > 0 && <Text style={styles.body}>{body}</Text>}

      {imageUrls.length > 0 && (
        <View style={styles.photos}>
          {imageUrls.map((url, index) => (
            <Image
              key={url}
              source={{ uri: postImageUrl(url) }}
              style={[
                styles.photo,
                imageUrls.length > 1 && styles.photoGrid,
                index === 0 && imageUrls.length === 3 && styles.photoWide,
              ]}
            />
          ))}
        </View>
      )}

      {post.effort && <Effort value={post.effort} />}
    </View>
  );
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
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
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
    color: '#FFFFFF',
    fontFamily: fonts.black,
    fontSize: 13,
    fontWeight: '900',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 16,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
  },
  editButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  photos: { borderRadius: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 3, overflow: 'hidden' },
  photo: { aspectRatio: 4 / 3, backgroundColor: colors.primarySoft, width: '100%' },
  photoGrid: { aspectRatio: 1, flexGrow: 1, width: '48%' },
  photoWide: { aspectRatio: 2, width: '100%' },
  effort: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  effortLabel: {
    color: colors.muted,
    fontFamily: fonts.black,
    fontSize: 10,
    fontWeight: '900',
  },
  effortBars: { flex: 1, flexDirection: 'row', gap: 3 },
  effortBar: { backgroundColor: colors.border, borderRadius: 2, flex: 1, height: 5 },
  effortBarActive: { backgroundColor: colors.primary },
  effortValue: { color: colors.primaryDark, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
});
