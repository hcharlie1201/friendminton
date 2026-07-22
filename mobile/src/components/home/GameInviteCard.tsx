import { StyleSheet, Text } from 'react-native';

import type { GameInvite } from '../../api/generated';
import { formatDate } from '../../lib/dates';
import { Card, colors, fonts } from '../ui';

export function GameInviteCard({ invite }: { invite: GameInvite }) {
  return (
    <Card>
      <Text style={styles.title}>{invite.title}</Text>
      <Text style={styles.meta}>
        {invite.venue} · {invite.city}
      </Text>
      <Text style={styles.body}>
        {invite.skill_level} · {invite.max_players} players · {formatDate(invite.starts_at)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 17,
    fontWeight: '900',
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
  },
});
