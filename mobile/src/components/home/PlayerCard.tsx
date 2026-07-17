import { StyleSheet, Text } from 'react-native';

import type { User } from '../../api/generated';
import { Card, colors, fonts } from '../ui';

export function PlayerCard({ player }: { player: User }) {
  return (
    <Card>
      <Text style={styles.title}>{player.display_name}</Text>
      <Text style={styles.meta}>
        {player.skill_level} {player.city ? `in ${player.city}` : ''}
      </Text>
      {player.bio && <Text style={styles.body}>{player.bio}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 17,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
  },
});
