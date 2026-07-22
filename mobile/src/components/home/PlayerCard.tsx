import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native';

import type { Player } from '../../api/generated';
import { colors, fonts } from '../ui';

type Props = {
  onOpenPlayer: (playerId: string) => void;
  player: Player;
};

export function PlayerCard({ onOpenPlayer, player }: Props) {
  const openPlayer = useOpenPlayerAction(player.id, onOpenPlayer);

  return (
    <Pressable
      accessibilityHint="Opens this player's profile"
      accessibilityLabel={`${player.display_name}, ${skillLevelLabel(player.skill_level)} player${player.city ? ` in ${player.city}` : ''}`}
      accessibilityRole="button"
      onPress={openPlayer}
      style={playerCardPressableStyle}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{playerInitials(player.display_name)}</Text>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{player.display_name}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {skillLevelLabel(player.skill_level)}{player.city ? ` · ${player.city}` : ''}
        </Text>
        {player.bio && <Text numberOfLines={2} style={styles.body}>{player.bio}</Text>}
      </View>
      <Ionicons color={colors.primary} name="chevron-forward" size={20} />
    </Pressable>
  );
}

function useOpenPlayerAction(playerId: string, onOpenPlayer: (playerId: string) => void) {
  return useCallback(() => {
    onOpenPlayer(playerId);
  }, [onOpenPlayer, playerId]);
}

function playerCardPressableStyle({ pressed }: PressableStateCallbackType) {
  return [styles.card, pressed && styles.cardPressed];
}

function playerInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
  return initials || '?';
}

function skillLevelLabel(skillLevel: string) {
  return `${skillLevel.charAt(0).toLocaleUpperCase()}${skillLevel.slice(1)}`;
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 112,
    padding: 14,
    width: 286,
  },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderColor: colors.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: colors.primaryStrong,
    fontFamily: fonts.black,
    fontSize: 16,
    fontWeight: '900',
  },
  copy: { flex: 1, gap: 3, minWidth: 0 },
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
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
