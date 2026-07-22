import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';
import { GatheringDiscoveryCard, type DiscoverGathering } from './GatheringDiscoveryCard';

type Props = {
  gatherings: readonly DiscoverGathering[];
  onOpenGathering?: (gatheringId: string) => void;
  previewCount?: number;
};

type LayerProps = {
  description: string;
  gatherings: DiscoverGathering[];
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onOpenGathering?: (gatheringId: string) => void;
  previewCount: number;
  tone: GatheringLayerTone;
  title: string;
};

type GatheringLayerTone = 'play' | 'hybrid' | 'social';

const DEFAULT_PREVIEW_COUNT = 2;

export function DiscoverGatheringSections({
  gatherings,
  onOpenGathering,
  previewCount = DEFAULT_PREVIEW_COUNT,
}: Props) {
  const layers = gatheringLayers(gatherings);
  const safePreviewCount = Math.max(1, Math.floor(previewCount));

  if (layers.play.length === 0 && layers.hybrid.length === 0 && layers.social.length === 0) return null;

  return (
    <View style={styles.layers}>
      {layers.play.length > 0 && (
        <GatheringLayer
          description="Open play, matches, drills, and coaching nearby."
          gatherings={layers.play}
          icon="badminton"
          onOpenGathering={onOpenGathering}
          previewCount={safePreviewCount}
          tone="play"
          title="Play sessions"
        />
      )}
      {layers.hybrid.length > 0 && (
        <GatheringLayer
          description="Rally first, then keep the hangout going."
          gatherings={layers.hybrid}
          icon="account-group-outline"
          onOpenGathering={onOpenGathering}
          previewCount={safePreviewCount}
          tone="hybrid"
          title="Play + social"
        />
      )}
      {layers.social.length > 0 && (
        <GatheringLayer
          description="Meet the badminton crowd off court too."
          gatherings={layers.social}
          icon="party-popper"
          onOpenGathering={onOpenGathering}
          previewCount={safePreviewCount}
          tone="social"
          title="Badminton socials"
        />
      )}
    </View>
  );
}

function GatheringLayer({
  description,
  gatherings,
  icon,
  onOpenGathering,
  previewCount,
  tone,
  title,
}: LayerProps) {
  const expansion = useLayerExpansion(gatherings.length, previewCount);
  const visibleGatherings = gatherings.slice(0, expansion.visibleCount);
  const toneStyle = gatheringLayerToneStyle(tone);

  return (
    <View style={styles.layer}>
      <View style={styles.header}>
        <View style={[styles.headingIcon, toneStyle.surface]}>
          <MaterialCommunityIcons color={toneStyle.strong} name={icon} size={20} />
        </View>
        <View style={styles.headingCopy}>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <View style={[styles.countBadge, toneStyle.badge]}>
              <Text style={[styles.countText, toneStyle.badgeText]}>{gatherings.length}</Text>
            </View>
          </View>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>

      <View style={styles.cards}>
        {visibleGatherings.map((gathering) => (
          <GatheringDiscoveryCard
            gathering={gathering}
            key={gathering.id}
            onOpenGathering={onOpenGathering}
          />
        ))}
      </View>

      {expansion.canToggle && (
        <Pressable
          accessibilityLabel={`${expansion.isExpanded ? 'Show fewer' : 'See all'} ${title.toLocaleLowerCase()}`}
          accessibilityRole="button"
          onPress={expansion.toggle}
          style={styles.moreButton}
        >
          <Text style={styles.moreText}>{expansion.isExpanded ? 'Show less' : `See all ${gatherings.length}`}</Text>
          <Ionicons
            color={colors.primaryStrong}
            name={expansion.isExpanded ? 'chevron-up' : 'arrow-forward'}
            size={17}
          />
        </Pressable>
      )}
    </View>
  );
}

function useLayerExpansion(total: number, previewCount: number) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggle = useCallback(() => {
    setIsExpanded((current) => !current);
  }, []);

  return {
    canToggle: total > previewCount,
    isExpanded,
    toggle,
    visibleCount: isExpanded ? total : previewCount,
  };
}

function gatheringLayers(gatherings: readonly DiscoverGathering[]) {
  const sorted = [...gatherings].sort(compareGatheringStart);
  return {
    play: sorted.filter(isPlayLayerGathering),
    hybrid: sorted.filter(isHybridLayerGathering),
    social: sorted.filter(isSocialLayerGathering),
  };
}

function isPlayLayerGathering(gathering: DiscoverGathering) {
  return gathering.kind === 'play';
}

function isHybridLayerGathering(gathering: DiscoverGathering) {
  return gathering.kind === 'play_and_social';
}

function isSocialLayerGathering(gathering: DiscoverGathering) {
  return gathering.kind === 'social';
}

function compareGatheringStart(first: DiscoverGathering, second: DiscoverGathering) {
  const firstTime = new Date(first.starts_at).getTime();
  const secondTime = new Date(second.starts_at).getTime();
  const safeFirst = Number.isNaN(firstTime) ? Number.MAX_SAFE_INTEGER : firstTime;
  const safeSecond = Number.isNaN(secondTime) ? Number.MAX_SAFE_INTEGER : secondTime;
  return safeFirst - safeSecond;
}

function gatheringLayerToneStyle(tone: GatheringLayerTone) {
  switch (tone) {
    case 'social':
      return {
        badge: styles.socialBadge,
        badgeText: styles.socialBadgeText,
        strong: colors.socialAccentStrong,
        surface: styles.socialSurface,
      };
    case 'hybrid':
      return {
        badge: styles.energyBadge,
        badgeText: styles.energyBadgeText,
        strong: colors.energyAccentStrong,
        surface: styles.energySurface,
      };
    default:
      return {
        badge: styles.playBadge,
        badgeText: styles.playBadgeText,
        strong: colors.playAccentStrong,
        surface: styles.playSurface,
      };
  }
}

const styles = StyleSheet.create({
  layers: { gap: 30 },
  layer: { gap: 13, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  headingIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  playSurface: { backgroundColor: colors.playAccentSurface },
  socialSurface: { backgroundColor: colors.socialAccentSurface },
  energySurface: { backgroundColor: colors.energyAccentSurface },
  headingCopy: { flex: 1, gap: 2, minWidth: 0 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 21, fontWeight: '900' },
  countBadge: {
    alignItems: 'center',
    borderRadius: 99,
    justifyContent: 'center',
    minWidth: 25,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  playBadge: { backgroundColor: colors.playAccent },
  socialBadge: { backgroundColor: colors.socialAccent },
  energyBadge: { backgroundColor: colors.energyAccent },
  countText: { fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  playBadgeText: { color: colors.text },
  socialBadgeText: { color: colors.textOnAccent },
  energyBadgeText: { color: colors.text },
  description: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  cards: { gap: 13, width: '100%' },
  moreButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySurface,
    borderColor: colors.borderStrong,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 15,
  },
  moreText: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 13, fontWeight: '900' },
});
