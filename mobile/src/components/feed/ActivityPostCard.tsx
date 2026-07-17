import { StyleSheet, Text, View } from 'react-native';

import type { FeedPost } from '../../api/generated';
import { formatDate } from '../../lib/dates';
import { colors, fonts } from '../ui';

type Props = {
  post: FeedPost;
};

export function ActivityPostCard({ post }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(post.display_name)}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{post.display_name}</Text>
          <Text style={styles.meta}>{formatDate(post.created_at)} · Badminton workout</Text>
        </View>
      </View>

      <Text style={styles.body}>{post.body}</Text>

      <View style={styles.stats}>
        <Metric label="Effort" value="Match" />
        <Metric label="Focus" value="Footwork" />
        <Metric label="Court" value="Indoor" />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
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
  stats: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingTop: 12,
  },
  metric: {
    flex: 1,
    gap: 2,
  },
  metricValue: {
    color: colors.primaryDark,
    fontFamily: fonts.black,
    fontSize: 15,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.muted,
    fontFamily: fonts.extraBold,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
