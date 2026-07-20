import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
} from 'react-native';

import {
  gatheringKindLabel,
  gatheringTheme,
  type GatheringKind,
  type GatheringThemeId,
} from '../../features/gatherings/gatheringDraft';
import { apiBaseUrl } from '../../config';
import { colors, fonts } from '../ui';

export type DiscoverGathering = {
  capacity?: number | null;
  city: string;
  cost_per_person_cents: number;
  court_count?: number | null;
  court_setup?: 'drop_in' | 'reserved' | null;
  cover_image_key?: string | null;
  cover_image_url?: string | null;
  created_at: string;
  currency: string;
  description?: string | null;
  ends_at?: string | null;
  host_id: string;
  id: string;
  join_policy: 'open' | 'approval_required' | 'invite_only' | 'members_only';
  kind: GatheringKind;
  play_format?: 'open_play' | 'round_robin' | 'doubles' | 'singles' | 'drills' | 'coaching' | null;
  skill_level?: string | null;
  social_tags: Array<'drinks' | 'food' | 'board_games' | 'watch_party' | 'gear_swap'>;
  starts_at: string;
  theme?: string | null;
  title: string;
  updated_at: string;
  venue: string;
  visibility: 'public' | 'private';
};

type Props = {
  gathering: DiscoverGathering;
  onOpenGathering?: (gatheringId: string) => void;
};

const coverShadeColors = ['rgba(4, 17, 37, 0.06)', 'rgba(4, 17, 37, 0.76)'] as const;

export function GatheringDiscoveryCard({ gathering, onOpenGathering }: Props) {
  const open = useOpenGatheringAction(gathering.id, onOpenGathering);
  const canOpen = onOpenGathering !== undefined;
  const schedule = formatGatheringSchedule(gathering.starts_at, gathering.ends_at);
  const metadata = gatheringMetadata(gathering);

  return (
    <Pressable
      accessibilityHint={canOpen ? 'Opens gathering details' : undefined}
      accessibilityLabel={gatheringAccessibilityLabel(gathering, schedule)}
      accessibilityRole={canOpen ? 'button' : undefined}
      disabled={!canOpen}
      onPress={open}
      style={cardPressableStyle}
    >
      <GatheringCardCover gathering={gathering} />

      <View style={styles.body}>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{gathering.title}</Text>

        <View style={styles.detailRow}>
          <Ionicons color={colors.primary} name="calendar-outline" size={18} />
          <Text style={styles.detailText}>{schedule}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons color={colors.primary} name="location-outline" size={18} />
          <Text numberOfLines={1} style={styles.detailText}>
            {formatVenue(gathering.venue, gathering.city)}
          </Text>
        </View>

        {metadata.length > 0 && (
          <View style={styles.chips}>
            {metadata.map((item) => (
              <View key={item} style={styles.chip}>
                <Text style={styles.chipText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.accessSummary}>
            <Ionicons
              color={colors.muted}
              name={gathering.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
              size={16}
            />
            <Text style={styles.accessText}>
              {visibilityLabel(gathering.visibility)} · {joinPolicyLabel(gathering.join_policy)}
            </Text>
          </View>
          <Text style={styles.price}>
            {formatGatheringCost(gathering.cost_per_person_cents, gathering.currency)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function GatheringCardCover({ gathering }: { gathering: DiscoverGathering }) {
  const remoteCover = useRemoteGatheringCover(resolveCoverUrl(gathering.cover_image_url));
  const theme = gatheringTheme(normalizeGatheringTheme(gathering.theme, gathering.kind));
  const dateTile = gatheringDateTile(gathering.starts_at);

  return (
    <LinearGradient colors={theme.colors} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.cover}>
      {remoteCover.shouldShow && (
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          onError={remoteCover.markFailed}
          resizeMode="cover"
          source={{ uri: remoteCover.uri }}
          style={styles.coverImage}
        />
      )}
      {remoteCover.shouldShow ? (
        <LinearGradient colors={coverShadeColors} style={styles.coverShade} />
      ) : (
        <CourtCardArtwork accent={theme.accent} />
      )}

      <View style={styles.coverTop}>
        <View style={styles.kindBadge}>
          <MaterialCommunityIcons color="#FFFFFF" name="badminton" size={15} />
          <Text style={styles.kindBadgeText}>{gatheringKindLabel(gathering.kind)}</Text>
        </View>
        <View style={styles.dateTile}>
          <Text style={styles.dateTileMonth}>{dateTile.month}</Text>
          <Text style={styles.dateTileDay}>{dateTile.day}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function resolveCoverUrl(value: string | null | undefined) {
  if (!value || value.startsWith('http://') || value.startsWith('https://')) return value;
  return `${apiBaseUrl}${value}`;
}

function CourtCardArtwork({ accent }: { accent: string }) {
  return (
    <View pointerEvents="none" style={styles.artwork}>
      <View style={[styles.glow, { backgroundColor: accent }]} />
      <View style={[styles.courtOutline, { borderColor: accent }]} />
      <View style={[styles.courtLine, { backgroundColor: accent }]} />
      <View style={[styles.netLine, { backgroundColor: accent }]} />
      <MaterialCommunityIcons color="#FFFFFF" name="badminton" size={88} style={styles.artworkIcon} />
    </View>
  );
}

function useOpenGatheringAction(
  gatheringId: string,
  onOpenGathering?: (gatheringId: string) => void,
) {
  return useCallback(() => {
    onOpenGathering?.(gatheringId);
  }, [gatheringId, onOpenGathering]);
}

function useRemoteGatheringCover(uri: string | null | undefined) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    if (uri !== failedUri) setFailedUri(null);
  }, [failedUri, uri]);

  const markFailed = useCallback(() => {
    if (uri) setFailedUri(uri);
  }, [uri]);

  return {
    markFailed,
    shouldShow: Boolean(uri && failedUri !== uri),
    uri: uri ?? '',
  };
}

function cardPressableStyle({ pressed }: PressableStateCallbackType) {
  return [styles.card, pressed && styles.cardPressed];
}

function normalizeGatheringTheme(theme: string | null | undefined, kind: GatheringKind): GatheringThemeId {
  if (theme === 'court_lights' || theme === 'birdie_burst' || theme === 'net_night' || theme === 'social_rally') {
    return theme;
  }
  if (kind === 'social') return 'social_rally';
  if (kind === 'play_and_social') return 'birdie_burst';
  return 'court_lights';
}

function gatheringAccessibilityLabel(gathering: DiscoverGathering, schedule: string) {
  return `${gatheringKindLabel(gathering.kind)}: ${gathering.title}. ${schedule}. ${formatVenue(gathering.venue, gathering.city)}.`;
}

function formatGatheringSchedule(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 'Schedule coming soon';

  const date = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(start);
  const startTime = formatGatheringTime(start);

  if (!endsAt) return `${date} · ${startTime}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${date} · ${startTime}`;

  if (isSameLocalDay(start, end)) return `${date} · ${startTime}–${formatGatheringTime(end)}`;
  const endDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(end);
  return `${date} · ${startTime} – ${endDate}, ${formatGatheringTime(end)}`;
}

function formatGatheringTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value);
}

function isSameLocalDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function gatheringDateTile(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return { day: '—', month: 'SOON' };
  return {
    day: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date).toUpperCase(),
  };
}

function gatheringMetadata(gathering: DiscoverGathering) {
  const items: string[] = [];

  if (gathering.play_format) items.push(playFormatLabel(gathering.play_format));
  if (gathering.skill_level) items.push(skillLevelLabel(gathering.skill_level));
  if (gathering.court_setup === 'drop_in') items.push('Drop-in courts');
  if (gathering.court_setup === 'reserved') {
    items.push(gathering.court_count
      ? `${gathering.court_count} reserved ${gathering.court_count === 1 ? 'court' : 'courts'}`
      : 'Courts reserved');
  }
  if (gathering.capacity) items.push(`${gathering.capacity} spots`);

  for (const tag of gathering.social_tags.slice(0, 2)) {
    items.push(socialTagLabel(tag));
  }

  if (gathering.social_tags.length > 2) items.push(`+${gathering.social_tags.length - 2} more`);
  return items.slice(0, 5);
}

function playFormatLabel(format: NonNullable<DiscoverGathering['play_format']>) {
  switch (format) {
    case 'open_play': return 'Open play';
    case 'doubles': return 'Doubles';
    case 'singles': return 'Singles';
    case 'drills': return 'Drills';
    case 'coaching': return 'Coaching';
    case 'round_robin': return 'Round robin';
  }
}

function socialTagLabel(tag: DiscoverGathering['social_tags'][number]) {
  switch (tag) {
    case 'drinks': return 'Drinks';
    case 'food': return 'Food';
    case 'board_games': return 'Board games';
    case 'watch_party': return 'Watch party';
    case 'gear_swap': return 'Gear swap';
  }
}

function skillLevelLabel(level: string) {
  if (level === 'all_levels') return 'All levels';
  if (level === 'e_plus') return 'E+';
  if (['e', 'd', 'c', 'b', 'a'].includes(level)) return level.toUpperCase();
  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatVenue(venue: string, city: string) {
  if (!city || venue.toLocaleLowerCase().includes(city.toLocaleLowerCase())) return venue;
  return `${venue} · ${city}`;
}

function visibilityLabel(visibility: DiscoverGathering['visibility']) {
  return visibility === 'private' ? 'Private' : 'Public';
}

function joinPolicyLabel(policy: DiscoverGathering['join_policy']) {
  switch (policy) {
    case 'approval_required': return 'Request to join';
    case 'invite_only': return 'Invite only';
    case 'members_only': return 'Members only';
    default: return 'Open';
  }
}

function formatGatheringCost(cents: number, currency: string) {
  if (cents <= 0) return 'Free';

  try {
    return new Intl.NumberFormat(undefined, {
      currency: currency || 'USD',
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      style: 'currency',
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || 'USD'}`;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#06366C',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    width: '100%',
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  cover: { height: 142, overflow: 'hidden' },
  coverImage: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  coverShade: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  coverTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  kindBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 17, 37, 0.56)',
    borderColor: 'rgba(255,255,255,0.36)',
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  kindBadgeText: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  dateTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 12,
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dateTileMonth: { color: colors.primaryDark, fontFamily: fonts.black, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  dateTileDay: { color: colors.ink, fontFamily: fonts.black, fontSize: 21, fontWeight: '900', lineHeight: 23 },
  artwork: { bottom: 0, left: 0, opacity: 0.92, position: 'absolute', right: 0, top: 0 },
  glow: { borderRadius: 100, height: 180, opacity: 0.12, position: 'absolute', right: -25, top: -17, width: 180 },
  courtOutline: {
    borderWidth: 2,
    height: 170,
    opacity: 0.36,
    position: 'absolute',
    right: -17,
    top: -45,
    transform: [{ rotate: '-14deg' }],
    width: 150,
  },
  courtLine: { height: 2, opacity: 0.34, position: 'absolute', right: -14, top: 54, transform: [{ rotate: '-14deg' }], width: 148 },
  netLine: { height: 130, opacity: 0.28, position: 'absolute', right: 58, top: -4, transform: [{ rotate: '-14deg' }], width: 2 },
  artworkIcon: { opacity: 0.27, position: 'absolute', right: 13, top: 33, transform: [{ rotate: '-15deg' }] },
  body: { gap: 10, padding: 16 },
  title: { color: colors.ink, fontFamily: fonts.black, fontSize: 21, fontWeight: '900', lineHeight: 25 },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  detailText: { color: colors.ink, flex: 1, fontFamily: fonts.bold, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 2 },
  chip: { backgroundColor: colors.primarySoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: colors.primaryDark, fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  footer: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 2,
    paddingTop: 12,
  },
  accessSummary: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6 },
  accessText: { color: colors.muted, flex: 1, fontFamily: fonts.bold, fontSize: 11, fontWeight: '700' },
  price: { color: colors.primaryDark, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
});
