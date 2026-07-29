import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getApiUsers, type Player } from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';
import { Button, TextField, colors, textSizes, textWeights } from '../ui';

type Props = {
  excludedUserIds: Set<string>;
  onInvite: (userId: string) => void;
  userId: string;
};

export function PlayerInviteSearch({ excludedUserIds, onInvite, userId }: Props) {
  const search = usePlayerInviteSearch(userId);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite a player</Text>
      <TextField
        accessibilityLabel="Search players to invite"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={search.setQuery}
        placeholder="Search by player name"
        value={search.query}
      />
      {search.results.isFetching && <ActivityIndicator color={colors.primaryStrong} />}
      {search.results.data?.map((player) => (
        <InviteResult
          disabled={excludedUserIds.has(player.id)}
          key={player.id}
          onInvite={onInvite}
          player={player}
        />
      ))}
      {search.query.trim().length >= 2 && !search.results.isFetching && search.results.data?.length === 0 && (
        <Text style={styles.empty}>No players found.</Text>
      )}
    </View>
  );
}

function InviteResult({
  disabled,
  onInvite,
  player,
}: {
  disabled: boolean;
  onInvite: (userId: string) => void;
  player: Player;
}) {
  const invite = useInviteResult(onInvite, player.id);
  return (
    <View style={styles.result}>
      <View style={styles.copy}>
        <Text style={styles.name}>{player.display_name}</Text>
        <Text style={styles.meta}>{[player.city, player.skill_level].filter(Boolean).join(' · ')}</Text>
      </View>
      <Button disabled={disabled} onPress={invite} size="compact" variant="secondary">
        {disabled ? 'Added' : 'Invite'}
      </Button>
    </View>
  );
}

function useInviteResult(onInvite: (userId: string) => void, userId: string) {
  return useCallback(() => onInvite(userId), [onInvite, userId]);
}

function usePlayerInviteSearch(userId: string) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim();
  const load = useCallback(
    () => apiData<Player[]>(getApiUsers({
      headers: authHeaders(userId),
      query: { limit: 8, query: normalizedQuery },
    })),
    [normalizedQuery, userId],
  );
  const results = useQuery({
    enabled: userId.length > 0 && normalizedQuery.length >= 2,
    queryFn: load,
    queryKey: ['players', 'invite-search', normalizedQuery, userId],
  });
  return { query, results, setQuery };
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { ...textSizes.small, ...textWeights.strong, color: colors.text },
  result: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  copy: { flex: 1 },
  name: { ...textSizes.small, ...textWeights.strong, color: colors.text },
  meta: { ...textSizes.caption, ...textWeights.regular, color: colors.textMuted, textTransform: 'capitalize' },
  empty: { ...textSizes.small, ...textWeights.regular, color: colors.textMuted },
});
