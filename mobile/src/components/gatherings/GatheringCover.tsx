import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  gatheringKindLabel,
  gatheringTheme,
  type GatheringCoverPhoto,
  type GatheringKind,
  type GatheringThemeId,
} from '../../features/gatherings/gatheringDraft';
import { colors, fonts } from '../ui';

type Props = {
  coverPhoto: GatheringCoverPhoto | null;
  dateLabel: string;
  hostName: string;
  kind: GatheringKind;
  onEditCover: () => void;
  themeId: GatheringThemeId;
  title: string;
};

export function GatheringCover({
  coverPhoto,
  dateLabel,
  hostName,
  kind,
  onEditCover,
  themeId,
  title,
}: Props) {
  const theme = gatheringTheme(themeId);

  return (
    <View style={styles.frame}>
      <LinearGradient colors={theme.colors} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.cover}>
        {coverPhoto && <Image accessible={false} resizeMode="cover" source={{ uri: coverPhoto.uri }} style={styles.coverPhoto} />}
        {coverPhoto && <View style={styles.photoShade} />}
        {!coverPhoto && <CourtArtwork accent={theme.accent} />}
        <LinearGradient
          colors={[colors.transparent, colors.overlayStrong]}
          pointerEvents="none"
          style={styles.bottomScrim}
        />

        <View style={styles.coverContent}>
          <View style={styles.kindBadge}>
            <MaterialCommunityIcons color={colors.textInverse} name="badminton" size={15} />
            <Text style={styles.kindText}>{gatheringKindLabel(kind)}</Text>
          </View>

          <View style={styles.coverBottom}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title.trim() || 'Name your gathering'}</Text>
            <Text style={styles.meta}>{dateLabel} · Hosted by {hostName}</Text>
          </View>
        </View>

        <Pressable accessibilityLabel="Choose a gathering cover photo" accessibilityRole="button" onPress={onEditCover} style={styles.editButton}>
          <MaterialCommunityIcons color={colors.text} name="image-edit-outline" size={19} />
          <Text style={styles.editText}>{coverPhoto ? 'Change' : 'Add photo'}</Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

function CourtArtwork({ accent }: { accent: string }) {
  return (
    <View pointerEvents="none" style={styles.artwork}>
      <View style={[styles.courtOuter, { borderColor: accent }]} />
      <View style={[styles.courtCenter, { backgroundColor: accent }]} />
      <View style={[styles.courtService, styles.courtServiceTop, { backgroundColor: accent }]} />
      <View style={[styles.courtService, styles.courtServiceBottom, { backgroundColor: accent }]} />
      <View style={[styles.shuttleGlow, { backgroundColor: accent }]} />
      <MaterialCommunityIcons color={colors.textInverse} name="badminton" size={112} style={styles.shuttleIcon} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
  },
  cover: { height: 300, overflow: 'hidden' },
  coverPhoto: { bottom: 0, height: '100%', left: 0, position: 'absolute', right: 0, top: 0, width: '100%' },
  photoShade: { backgroundColor: colors.imageOverlay, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  bottomScrim: { bottom: 0, height: 160, left: 0, position: 'absolute', right: 0 },
  artwork: { bottom: 0, left: 0, opacity: 0.88, position: 'absolute', right: 0, top: 0 },
  courtOuter: {
    borderWidth: 2,
    height: 245,
    opacity: 0.42,
    position: 'absolute',
    right: -34,
    top: -24,
    transform: [{ rotate: '-15deg' }],
    width: 190,
  },
  courtCenter: {
    height: 2,
    opacity: 0.42,
    position: 'absolute',
    right: -18,
    top: 97,
    transform: [{ rotate: '-15deg' }],
    width: 160,
  },
  courtService: {
    height: 2,
    opacity: 0.32,
    position: 'absolute',
    right: 17,
    transform: [{ rotate: '75deg' }],
    width: 84,
  },
  courtServiceTop: { top: 47 },
  courtServiceBottom: { top: 151 },
  shuttleGlow: {
    borderRadius: 100,
    height: 190,
    opacity: 0.13,
    position: 'absolute',
    right: -22,
    top: 40,
    width: 190,
  },
  shuttleIcon: {
    opacity: 0.24,
    position: 'absolute',
    right: 12,
    top: 66,
    transform: [{ rotate: '-18deg' }],
  },
  coverContent: { flex: 1, justifyContent: 'space-between', padding: 20 },
  kindBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.imageOverlay,
    borderColor: colors.imageOverlayBorder,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  kindText: { color: colors.textInverse, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  coverBottom: { gap: 7, maxWidth: '88%' },
  title: { color: colors.textInverse, fontFamily: fonts.black, fontSize: 31, fontWeight: '900', lineHeight: 35 },
  meta: { color: colors.imageOverlayText, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' },
  editButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: 'absolute',
    right: 16,
    top: 16,
  },
  editText: { color: colors.text, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
});
