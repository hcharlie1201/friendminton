import { StyleSheet, Text } from 'react-native';

import type { Player } from '../../api/generated';
import { Button, Card, colors, fonts, Section } from '../ui';
import { PlayerCard } from './PlayerCard';

type Props = {
  hasError: boolean;
  onRetry: () => void;
  players: Player[];
  query: string;
};

export function PlayerSearchResults({ hasError, onRetry, players, query }: Props) {
  const title = query ? `Results for "${query}"` : 'Players nearby';

  if (hasError && players.length === 0) {
    return (
      <Section itemCount={0} title={title}>
        <Card>
          <Text style={styles.errorTitle}>Search is unavailable</Text>
          <Text style={styles.errorBody}>We couldn't load players right now. Check your connection and try again.</Text>
          <Button icon="refresh" onPress={onRetry} size="compact" variant="secondary">
            Try again
          </Button>
        </Card>
      </Section>
    );
  }

  return (
    <Section
      emptyText={query ? 'No matching players found.' : 'No players found yet.'}
      itemCount={players.length}
      title={title}
    >
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  errorTitle: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 17,
    fontWeight: '900',
  },
  errorBody: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});
