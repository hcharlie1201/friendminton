import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, type ReactNode } from 'react';
import {
  Linking,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
} from 'react-native';

import type {
  BadmintonGroup,
  Court,
  DiscoveryResult,
  Gathering,
  Player,
} from '../../api/generated';
import { colors, textSizes, textWeights } from '../ui';
import { profileImageUrl } from '../../features/profile/profileImage';

type Props = {
  onOpenGathering: (gatheringId: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenPlayer: (playerId: string) => void;
  result: DiscoveryResult;
};

export function DiscoveryResultRow({
  onOpenGathering,
  onOpenGroup,
  onOpenPlayer,
  result,
}: Props) {
  if (result.category === 'games') {
    return <GameResult gathering={result.item} onOpen={onOpenGathering} />;
  }
  if (result.category === 'courts') {
    return <CourtResult court={result.item} />;
  }
  if (result.category === 'groups') {
    return <GroupResult group={result.item} onOpen={onOpenGroup} />;
  }
  return <PlayerResult onOpen={onOpenPlayer} player={result.item} />;
}

function GameResult({ gathering, onOpen }: { gathering: Gathering; onOpen: Props['onOpenGathering'] }) {
  const open = useEntityOpen(gathering.id, onOpen);
  return (
    <ResultPressable
      icon={<MaterialCommunityIcons color={colors.playAccentStrong} name="badminton" size={25} />}
      label={`Open ${gathering.title}`}
      meta={`${formatSchedule(gathering.starts_at)} · ${gathering.venue}, ${gathering.city}`}
      onPress={open}
      title={gathering.title}
    />
  );
}

function CourtResult({ court }: { court: Court }) {
  const open = useCourtDirections(court);
  return (
    <ResultPressable
      icon={<Ionicons color={colors.success} name="location" size={24} />}
      label={`Directions to ${court.name}`}
      meta={`${court.address} · ${court.environment}`}
      onPress={open}
      title={court.name}
    />
  );
}

function GroupResult({ group, onOpen }: { group: BadmintonGroup; onOpen: Props['onOpenGroup'] }) {
  const open = useEntityOpen(group.id, onOpen);
  return (
    <ResultPressable
      icon={<MaterialCommunityIcons color={colors.primaryStrong} name="account-group" size={25} />}
      label={`Open ${group.name}`}
      meta={`${group.location_label ?? group.city} · ${group.member_count} members`}
      onPress={open}
      title={group.name}
    />
  );
}

function PlayerResult({ onOpen, player }: { onOpen: Props['onOpenPlayer']; player: Player }) {
  const open = useEntityOpen(player.id, onOpen);
  const avatarUrl = profileImageUrl(player.avatar_url);
  return (
    <ResultPressable
      icon={avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.playerImage} /> : <Ionicons color={colors.primaryStrong} name="person" size={24} />}
      label={`Open ${player.display_name}`}
      meta={`${skillLabel(player.skill_level)}${player.city ? ` · ${player.city}` : ''}`}
      onPress={open}
      title={player.display_name}
    />
  );
}

function ResultPressable({
  icon,
  label,
  meta,
  onPress,
  title,
}: {
  icon: ReactNode;
  label: string;
  meta: string;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={resultPressableStyle}
    >
      <View style={styles.iconTile}>{icon}</View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Text numberOfLines={2} style={styles.meta}>{meta}</Text>
      </View>
      <Ionicons color={colors.textMuted} name="chevron-forward" size={21} />
    </Pressable>
  );
}

function useEntityOpen(id: string, onOpen: (id: string) => void) {
  return useCallback(() => onOpen(id), [id, onOpen]);
}

function useCourtDirections(court: Court) {
  return useCallback(() => {
    const destination = encodeURIComponent(`${court.latitude},${court.longitude}`);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  }, [court.latitude, court.longitude]);
}

function resultPressableStyle({ pressed }: PressableStateCallbackType) {
  return [styles.result, pressed && styles.resultPressed];
}

function formatSchedule(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Upcoming';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function skillLabel(value: string) {
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  result: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 88,
    paddingVertical: 12,
  },
  resultPressed: { opacity: 0.7 },
  iconTile: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  playerImage: { borderRadius: 12, height: 54, width: 54 },
  copy: { flex: 1, gap: 4, minWidth: 0 },
  title: { ...textSizes.medium, ...textWeights.heavy, color: colors.text },
  meta: {
    ...textSizes.xSmall,
    ...textWeights.regular,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
});
