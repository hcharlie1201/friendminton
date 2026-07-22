import { apiBaseUrl } from '../../config';
import type { GatheringKind, GatheringThemeId } from './gatheringDraft';

export type GatheringTimingStatus = 'upcoming' | 'ongoing' | 'ended';

const DEFAULT_GATHERING_DURATION_MILLISECONDS = 4 * 60 * 60 * 1000;

export function resolveGatheringCoverUrl(value: string | null | undefined) {
  if (!value || value.startsWith('http://') || value.startsWith('https://')) return value;
  return `${apiBaseUrl}${value}`;
}

export function normalizeGatheringTheme(
  theme: string | null | undefined,
  kind: GatheringKind,
): GatheringThemeId {
  if (theme === 'court_lights' || theme === 'birdie_burst' || theme === 'net_night' || theme === 'social_rally') {
    return theme;
  }
  if (kind === 'social') return 'social_rally';
  if (kind === 'play_and_social') return 'birdie_burst';
  return 'court_lights';
}

export function formatGatheringSchedule(startsAt: string, endsAt?: string | null) {
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

export function formatGatheringVenue(venue: string, city: string) {
  if (!city || venue.toLocaleLowerCase().includes(city.toLocaleLowerCase())) return venue;
  return `${venue} · ${city}`;
}

export function gatheringTimingStatus(
  startsAt: string,
  endsAt?: string | null,
  now = new Date(),
): GatheringTimingStatus {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 'upcoming';
  if (start > now) return 'upcoming';

  const end = gatheringEndTime(start, endsAt);
  return end > now ? 'ongoing' : 'ended';
}

export function gatheringTimingLabel(status: GatheringTimingStatus) {
  switch (status) {
    case 'ongoing': return 'Happening now';
    case 'ended': return 'Ended';
    default: return 'Upcoming';
  }
}

function formatGatheringTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value);
}

function isSameLocalDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function gatheringEndTime(start: Date, endsAt?: string | null) {
  if (endsAt) {
    const end = new Date(endsAt);
    if (!Number.isNaN(end.getTime())) return end;
  }
  return new Date(start.getTime() + DEFAULT_GATHERING_DURATION_MILLISECONDS);
}
