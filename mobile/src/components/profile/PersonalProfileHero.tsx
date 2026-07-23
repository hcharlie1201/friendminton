import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import type { Player, WeeklySnapshot } from '../../api/generated';
import { colors, fonts } from '../ui';

type Props = {
  displayName: string;
  groupCount: number;
  player?: Player;
  snapshot?: WeeklySnapshot;
};

export function PersonalProfileHero({ displayName, groupCount, player, snapshot }: Props) {
  const city = player?.city?.trim();
  const bio = player?.bio?.trim();

  return (
    <View style={styles.section}>
      <LinearGradient
        colors={[colors.primarySurface, colors.socialAccentSurface, colors.playAccentSurface]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.hero}
      >
        <View pointerEvents="none" style={styles.cloudLarge} />
        <View pointerEvents="none" style={styles.cloudSmall} />
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profileInitials(displayName)}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.eyebrow}>YOUR BADMINTON PROFILE</Text>
            <Text accessibilityRole="header" style={styles.name}>{displayName}</Text>
            <View style={styles.profileMeta}>
              {city && <ProfileMeta icon="location-outline" label={city} />}
              {player?.skill_level && (
                <ProfileMeta icon="speedometer-outline" label={skillLevelLabel(player.skill_level)} />
              )}
            </View>
          </View>
        </View>
        <Text style={styles.bio}>{bio || 'Add a short bio about how you like to play and what you are working toward.'}</Text>
      </LinearGradient>

      <View style={styles.stats}>
        <ProfileStat label="Activities" value={`${snapshot?.activities ?? 0}`} />
        <ProfileStat label="Play time" value={formatMinutes(snapshot?.duration_minutes ?? 0)} />
        <ProfileStat label="Games" value={`${snapshot?.games ?? 0}`} />
        <ProfileStat label="Groups" value={`${groupCount}`} />
      </View>

      <View style={styles.weeklyNote}>
        <View style={styles.weeklyIcon}>
          <MaterialCommunityIcons color={colors.energyAccentStrong} name="badminton" size={22} />
        </View>
        <View style={styles.weeklyCopy}>
          <Text style={styles.weeklyTitle}>This week</Text>
          <Text style={styles.weeklyBody}>{weeklySummary(snapshot)}</Text>
        </View>
      </View>
    </View>
  );
}

function ProfileMeta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaBadge}>
      <Ionicons color={colors.primaryStrong} name={icon} size={14} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>{value}</Text>
    </View>
  );
}

function profileInitials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('') || '?';
}

function skillLevelLabel(value: string) {
  if (value === 'e_plus') return 'E+';
  if (['e', 'd', 'c', 'b', 'a'].includes(value)) return value.toUpperCase();
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function weeklySummary(snapshot?: WeeklySnapshot) {
  const activities = snapshot?.activities ?? 0;
  if (activities === 0) return 'Join a play session to start building your week.';
  const games = snapshot?.games ?? 0;
  return `${activities} ${activities === 1 ? 'activity' : 'activities'} and ${games} ${games === 1 ? 'game' : 'games'} completed.`;
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 8,
    gap: 18,
    paddingBottom: 24,
  },
  hero: { gap: 16, overflow: 'hidden', paddingHorizontal: 20, paddingBottom: 22, paddingTop: 28 },
  cloudLarge: {
    backgroundColor: colors.surfaceOverlay,
    borderRadius: 120,
    height: 170,
    opacity: 0.48,
    position: 'absolute',
    right: -55,
    top: -70,
    width: 210,
  },
  cloudSmall: {
    backgroundColor: colors.socialAccent,
    borderRadius: 70,
    bottom: -58,
    height: 120,
    opacity: 0.2,
    position: 'absolute',
    right: 45,
    width: 120,
  },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 15 },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: 24,
    borderWidth: 4,
    height: 82,
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: 82,
  },
  avatarText: { color: colors.textOnPrimary, fontFamily: fonts.black, fontSize: 27, fontWeight: '900' },
  identityCopy: { flex: 1, gap: 5, minWidth: 0 },
  eyebrow: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  name: { color: colors.text, fontFamily: fonts.black, fontSize: 27, fontWeight: '900', lineHeight: 32 },
  profileMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  metaText: { color: colors.primaryStrong, fontFamily: fonts.bold, fontSize: 10, fontWeight: '700' },
  bio: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, maxWidth: 330 },
  stats: { flexDirection: 'row', paddingHorizontal: 14 },
  stat: { alignItems: 'center', flex: 1, gap: 3, minWidth: 0, paddingHorizontal: 3 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10 },
  statValue: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  weeklyNote: {
    alignItems: 'center',
    backgroundColor: colors.energyAccentSurface,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 11,
    marginHorizontal: 20,
    padding: 13,
  },
  weeklyIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  weeklyCopy: { flex: 1, gap: 1 },
  weeklyTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 13, fontWeight: '900' },
  weeklyBody: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
});
