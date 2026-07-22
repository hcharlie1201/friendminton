import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import {
  gatheringTheme,
  type GatheringThemeId,
} from '../../features/gatherings/gatheringDraft';
import { colors, fonts } from '../ui';

type Props = {
  coverImageUrl?: string | null;
  kindLabel: string;
  locationLabel: string;
  scheduleLabel: string;
  themeId: GatheringThemeId;
  title: string;
  visibility: 'public' | 'private';
};

const heroShade = [colors.imageOverlayClear, colors.overlayStrong] as const;

export function GatheringDetailHero({
  coverImageUrl,
  kindLabel,
  locationLabel,
  scheduleLabel,
  themeId,
  title,
  visibility,
}: Props) {
  const theme = gatheringTheme(themeId);
  const cover = useGatheringHeroCover(coverImageUrl);

  return (
    <LinearGradient colors={theme.colors} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
      {cover.shouldShow && (
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          onError={cover.markFailed}
          resizeMode="cover"
          source={{ uri: cover.uri }}
          style={styles.coverImage}
        />
      )}
      {cover.shouldShow ? (
        <LinearGradient colors={heroShade} style={styles.photoShade} />
      ) : (
        <GatheringCourtArtwork accent={theme.accent} />
      )}

      <View style={styles.heroContent}>
        <View style={styles.badges}>
          <View style={styles.badge}>
            <MaterialCommunityIcons color={colors.textInverse} name="badminton" size={16} />
            <Text style={styles.badgeText}>{kindLabel}</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons
              color={colors.textInverse}
              name={visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
              size={15}
            />
            <Text style={styles.badgeText}>{visibility === 'private' ? 'Private' : 'Public'}</Text>
          </View>
        </View>

        <View style={styles.heroCopy}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <View style={styles.metaRow}>
            <Ionicons color={colors.imageOverlayText} name="calendar-outline" size={16} />
            <Text style={styles.meta}>{scheduleLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons color={colors.imageOverlayText} name="location-outline" size={16} />
            <Text numberOfLines={2} style={styles.meta}>{locationLabel}</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

function GatheringCourtArtwork({ accent }: { accent: string }) {
  return (
    <View pointerEvents="none" style={styles.artwork}>
      <View style={[styles.glow, { backgroundColor: accent }]} />
      <View style={[styles.courtOuter, { borderColor: accent }]} />
      <View style={[styles.courtLine, styles.courtCenter, { backgroundColor: accent }]} />
      <View style={[styles.courtLine, styles.courtService, { backgroundColor: accent }]} />
      <MaterialCommunityIcons color={colors.textInverse} name="badminton" size={132} style={styles.shuttle} />
    </View>
  );
}

function useGatheringHeroCover(uri: string | null | undefined) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    if (failedUri && failedUri !== uri) setFailedUri(null);
  }, [failedUri, uri]);

  const markFailed = useCallback(() => {
    if (uri) setFailedUri(uri);
  }, [uri]);

  return {
    markFailed,
    shouldShow: Boolean(uri && uri !== failedUri),
    uri: uri ?? '',
  };
}

const styles = StyleSheet.create({
  hero: {
    height: 390,
    overflow: 'hidden',
    width: '100%',
  },
  coverImage: { bottom: 0, height: '100%', left: 0, position: 'absolute', right: 0, top: 0, width: '100%' },
  photoShade: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  artwork: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  glow: { borderRadius: 170, height: 310, opacity: 0.13, position: 'absolute', right: -70, top: 10, width: 310 },
  courtOuter: {
    borderWidth: 2,
    height: 310,
    opacity: 0.42,
    position: 'absolute',
    right: -58,
    top: -28,
    transform: [{ rotate: '-13deg' }],
    width: 235,
  },
  courtLine: { height: 2, opacity: 0.42, position: 'absolute', right: -30, transform: [{ rotate: '-13deg' }] },
  courtCenter: { top: 126, width: 220 },
  courtService: { right: 18, top: 76, transform: [{ rotate: '77deg' }], width: 110 },
  shuttle: { opacity: 0.24, position: 'absolute', right: 10, top: 86, transform: [{ rotate: '-18deg' }] },
  heroContent: { flex: 1, justifyContent: 'space-between', padding: 20 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.imageOverlay,
    borderColor: colors.imageOverlayBorder,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  badgeText: { color: colors.textInverse, fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  heroCopy: { gap: 8 },
  title: { color: colors.textInverse, fontFamily: fonts.black, fontSize: 32, fontWeight: '900', lineHeight: 38 },
  metaRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 7 },
  meta: { color: colors.imageOverlayText, flex: 1, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700', lineHeight: 18 },
});
