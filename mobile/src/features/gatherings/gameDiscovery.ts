import type {
  CourtSetup,
  Gathering,
  GatheringSkillLevel,
  GatheringVisibility,
  PlayFormat,
} from '../../api/generated';

export type DiscoverSection = 'explore' | 'games';
export type GameResultsLayout = 'list' | 'map';
export type GameDateFilter = 'any' | 'week_0' | 'week_1' | 'week_2' | 'week_3';
export type GameCostFilter = 'any' | 'free' | 'paid';
export type GameQuickFilter = 'all' | 'open_play' | 'private' | 'round_robin';

export type GameDiscoveryFilters = {
  cost: GameCostFilter;
  courtSetup: CourtSetup | null;
  date: GameDateFilter;
  level: GatheringSkillLevel | null;
  playFormat: PlayFormat | null;
  visibility: GatheringVisibility | null;
};

export const defaultGameDiscoveryFilters: GameDiscoveryFilters = {
  cost: 'any',
  courtSetup: null,
  date: 'week_0',
  level: null,
  playFormat: null,
  visibility: null,
};

export function filterGames(gatherings: readonly Gathering[], filters: GameDiscoveryFilters, now = new Date()) {
  return gatherings
    .filter(isPlayableGathering)
    .filter((gathering) => matchesDate(gathering, filters.date, now))
    .filter((gathering) => !filters.playFormat || gathering.play_format === filters.playFormat)
    .filter((gathering) => !filters.visibility || gathering.visibility === filters.visibility)
    .filter((gathering) => !filters.level || !gathering.skill_level || gathering.skill_level === filters.level)
    .filter((gathering) => !filters.courtSetup || gathering.court_setup === filters.courtSetup)
    .filter((gathering) => matchesCost(gathering.cost_per_person_cents, filters.cost))
    .sort(compareStartTime);
}

export function activeGameFilterCount(filters: GameDiscoveryFilters) {
  return Number(filters.date !== defaultGameDiscoveryFilters.date)
    + Number(filters.playFormat !== null)
    + Number(filters.level !== null)
    + Number(filters.courtSetup !== null)
    + Number(filters.cost !== defaultGameDiscoveryFilters.cost)
    + Number(filters.visibility !== null);
}

export function quickFilterFor(filters: GameDiscoveryFilters): GameQuickFilter {
  if (filters.visibility === 'private') return 'private';
  if (filters.playFormat === 'open_play') return 'open_play';
  if (filters.playFormat === 'round_robin') return 'round_robin';
  return 'all';
}

export function applyQuickFilter(filters: GameDiscoveryFilters, quickFilter: GameQuickFilter) {
  return {
    ...filters,
    playFormat: quickFilter === 'open_play' || quickFilter === 'round_robin' ? quickFilter : null,
    visibility: quickFilter === 'private' ? 'private' as const : null,
  };
}

export function gameDateOptions(now = new Date()) {
  return ([0, 1, 2, 3] as const).map((week) => ({
    label: week === 0 ? 'Next 7 days' : weekRangeLabel(week, now),
    value: `week_${week}` as GameDateFilter,
  }));
}

function isPlayableGathering(gathering: Gathering) {
  return gathering.kind === 'play' || gathering.kind === 'play_and_social';
}

function matchesCost(cents: number, filter: GameCostFilter) {
  if (filter === 'free') return cents === 0;
  if (filter === 'paid') return cents > 0;
  return true;
}

function matchesDate(gathering: Gathering, filter: GameDateFilter, now: Date) {
  if (filter === 'any') return true;
  const start = new Date(gathering.starts_at);
  if (Number.isNaN(start.getTime())) return false;

  const week = Number(filter.slice(-1));
  if (week === 0 && isOngoing(gathering, now)) return true;
  const rangeStart = startOfDay(now);
  rangeStart.setDate(rangeStart.getDate() + week * 7);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 7);
  return start >= rangeStart && start < rangeEnd;
}

function isOngoing(gathering: Gathering, now: Date) {
  if (!gathering.ends_at) return false;
  const start = new Date(gathering.starts_at);
  const end = new Date(gathering.ends_at);
  return !Number.isNaN(start.getTime())
    && !Number.isNaN(end.getTime())
    && start <= now
    && end > now;
}

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function weekRangeLabel(week: number, now: Date) {
  const first = startOfDay(now);
  first.setDate(first.getDate() + week * 7);
  const last = new Date(first);
  last.setDate(last.getDate() + 6);
  const firstLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(first);
  const lastLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(last);
  return `${firstLabel} – ${lastLabel}`;
}

function compareStartTime(first: Gathering, second: Gathering) {
  return new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime();
}
