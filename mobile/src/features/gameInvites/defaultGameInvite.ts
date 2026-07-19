import type { CreateGameInvite } from '../../api/generated';

const ONE_DAY_IN_MILLISECONDS = 86_400_000;

const defaultGameInvite = {
  maxPlayers: 8,
  skillLevel: 'intermediate',
  title: 'Evening doubles',
  venue: 'Downtown Rec Center',
} as const;

export function buildDefaultGameInvite(city: string, now = Date.now()): CreateGameInvite {
  return {
    city,
    max_players: defaultGameInvite.maxPlayers,
    skill_level: defaultGameInvite.skillLevel,
    starts_at: new Date(now + ONE_DAY_IN_MILLISECONDS).toISOString(),
    title: defaultGameInvite.title,
    venue: defaultGameInvite.venue,
  };
}
