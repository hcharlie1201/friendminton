export type GatheringKind = 'play' | 'social' | 'play_and_social';
export type GatheringVisibility = 'public' | 'private';
export type GatheringJoinPolicy = 'open' | 'approval_required' | 'invite_only';
export type GatheringPlayFormat = 'open_play' | 'round_robin' | 'doubles' | 'singles' | 'drills' | 'coaching';
export type GatheringSkillLevel = 'all_levels' | 'beginner' | 'e' | 'e_plus' | 'd' | 'c' | 'b' | 'a';
export type GatheringCourtSetup = 'drop_in' | 'reserved';
export type GatheringSocialTag = 'drinks' | 'food' | 'board_games' | 'watch_party' | 'gear_swap';
export type GatheringThemeId = 'court_lights' | 'birdie_burst' | 'net_night' | 'social_rally';

export type GatheringDraft = {
  capacity: string;
  city: string;
  costPerPersonCents: number;
  courtSetup: GatheringCourtSetup;
  courtCount: string;
  coverPhoto: GatheringCoverPhoto | null;
  description: string;
  endsAt: Date;
  joinPolicy: GatheringJoinPolicy;
  kind: GatheringKind;
  latitude: number | null;
  location: GatheringLocation | null;
  longitude: number | null;
  playFormat: GatheringPlayFormat;
  skillLevel: GatheringSkillLevel;
  socialTags: GatheringSocialTag[];
  startsAt: Date;
  theme: GatheringThemeId;
  title: string;
  venue: string;
  visibility: GatheringVisibility;
};

export type GatheringLocation = {
  address: string;
  city: string | null;
  label: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

export type GatheringCoverPhoto = {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
};

export type GatheringTheme = {
  accent: string;
  colors: readonly [string, string, ...string[]];
  id: GatheringThemeId;
  label: string;
};

export const gatheringThemes: GatheringTheme[] = [
  {
    accent: '#C7FF4A',
    colors: ['#031D44', '#0759B8', '#0B8FFF'],
    id: 'court_lights',
    label: 'Court Lights',
  },
  {
    accent: '#FFD447',
    colors: ['#5B1DA8', '#C53BE8', '#FF526D'],
    id: 'birdie_burst',
    label: 'Birdie Burst',
  },
  {
    accent: '#26E7FF',
    colors: ['#07162D', '#073B78', '#006F8F'],
    id: 'net_night',
    label: 'Net Night',
  },
  {
    accent: '#E5FF4E',
    colors: ['#D92D45', '#FF6333', '#FF9F2F'],
    id: 'social_rally',
    label: 'Social Rally',
  },
];

const TWO_HOURS_IN_MILLISECONDS = 2 * 60 * 60 * 1000;

export function createInitialGatheringDraft(
  city: string,
  kind: GatheringKind = 'play',
  now = new Date(),
): GatheringDraft {
  const startsAt = nextGatheringStart(now);
  return {
    capacity: '12',
    city,
    costPerPersonCents: 0,
    courtSetup: 'drop_in',
    courtCount: '2',
    coverPhoto: null,
    description: '',
    endsAt: new Date(startsAt.getTime() + TWO_HOURS_IN_MILLISECONDS),
    joinPolicy: 'open',
    kind,
    latitude: null,
    location: null,
    longitude: null,
    playFormat: 'open_play',
    skillLevel: 'all_levels',
    socialTags: kind === 'play' ? [] : ['food'],
    startsAt,
    theme: themeForKind(kind),
    title: '',
    venue: '',
    visibility: 'public',
  };
}

export function gatheringKindLabel(kind: GatheringKind) {
  switch (kind) {
    case 'social':
      return 'Badminton social';
    case 'play_and_social':
      return 'Play + social';
    default:
      return 'Play session';
  }
}

export function gatheringTheme(themeId: GatheringThemeId) {
  return gatheringThemes.find((theme) => theme.id === themeId) ?? gatheringThemes[0];
}

export function isPlayGathering(kind: GatheringKind) {
  return kind === 'play' || kind === 'play_and_social';
}

export function isSocialGathering(kind: GatheringKind) {
  return kind === 'social' || kind === 'play_and_social';
}

export function parseGatheringKind(value: string | string[] | undefined): GatheringKind {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === 'social' || candidate === 'play_and_social') return candidate;
  return 'play';
}

function nextGatheringStart(now: Date) {
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);
  return start;
}

function themeForKind(kind: GatheringKind): GatheringThemeId {
  if (kind === 'social') return 'social_rally';
  if (kind === 'play_and_social') return 'birdie_burst';
  return 'court_lights';
}
