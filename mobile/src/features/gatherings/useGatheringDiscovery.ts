import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getApiGatherings, type Gathering } from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';

type Options = {
  city: string;
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  skillLevel: string | null;
  userId: string;
};

const GATHERING_RESULT_LIMIT = 30;
const DISCOVERY_LOOKBACK_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

export function useGatheringDiscovery({ city, enabled, latitude, longitude, skillLevel, userId }: Options) {
  const query = useQuery({
    enabled,
    queryKey: ['gatherings', userId, city, latitude, longitude],
    queryFn: () => loadGatherings(city, latitude, longitude, userId),
  });
  const gatherings = useMemo(
    () => filterGatheringsForLevel(query.data ?? [], skillLevel),
    [query.data, skillLevel],
  );

  return { ...query, gatherings };
}

async function loadGatherings(city: string, latitude: number | null, longitude: number | null, userId: string) {
  const hasCoordinates = latitude !== null && longitude !== null;
  const headers = authHeaders(userId);
  const now = new Date();
  const startsAfter = new Date(now.getTime() - DISCOVERY_LOOKBACK_MILLISECONDS).toISOString();
  const cityRequest = apiData<Gathering[]>(getApiGatherings({
    headers,
    query: {
      city,
      limit: GATHERING_RESULT_LIMIT,
      starts_after: startsAfter,
    },
  }));
  if (!hasCoordinates) return (await cityRequest).filter((gathering) => isActiveOrUpcoming(gathering, now));

  const nearbyRequest = apiData<Gathering[]>(getApiGatherings({
    headers,
    query: {
      latitude,
      limit: GATHERING_RESULT_LIMIT,
      longitude,
      radius_km: 40,
      starts_after: startsAfter,
    },
  }));
  const [nearbyGatherings, cityGatherings] = await Promise.all([nearbyRequest, cityRequest]);
  const gatherings = mergeGatherings(nearbyGatherings, cityGatherings)
    .filter((gathering) => isActiveOrUpcoming(gathering, now));

  if (__DEV__) {
    console.info('[Friendminton:gatherings] discovery results', {
      city,
      cityCount: cityGatherings.length,
      mergedCount: gatherings.length,
      nearbyCount: nearbyGatherings.length,
    });
  }

  return gatherings;
}

function isActiveOrUpcoming(gathering: Gathering, now: Date) {
  const startsAt = new Date(gathering.starts_at);
  if (Number.isNaN(startsAt.getTime())) return false;
  if (startsAt >= now) return true;
  if (!gathering.ends_at) return false;

  const endsAt = new Date(gathering.ends_at);
  return !Number.isNaN(endsAt.getTime()) && endsAt > now;
}

function mergeGatherings(...collections: readonly Gathering[][]) {
  const gatherings = new Map<string, Gathering>();
  for (const collection of collections) {
    for (const gathering of collection) gatherings.set(gathering.id, gathering);
  }
  return [...gatherings.values()].sort(compareGatheringStart);
}

function compareGatheringStart(left: Gathering, right: Gathering) {
  return new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime();
}

function filterGatheringsForLevel(gatherings: Gathering[], skillLevel: string | null) {
  if (!skillLevel) return gatherings;
  const compatibleLevels = gatheringLevelsForPlayer(skillLevel);
  return gatherings.filter(
    (gathering) => !gathering.skill_level || compatibleLevels.includes(gathering.skill_level),
  );
}

function gatheringLevelsForPlayer(skillLevel: string) {
  switch (skillLevel) {
    case 'beginner': return ['beginner', 'e'];
    case 'intermediate': return ['e_plus', 'd'];
    case 'advanced': return ['c', 'b'];
    case 'competitive': return ['a'];
    default: return [skillLevel];
  }
}
