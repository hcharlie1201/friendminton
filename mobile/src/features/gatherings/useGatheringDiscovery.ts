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

function loadGatherings(city: string, latitude: number | null, longitude: number | null, userId: string) {
  const hasCoordinates = latitude !== null && longitude !== null;
  return apiData<Gathering[]>(getApiGatherings({
    headers: authHeaders(userId),
    query: {
      city: hasCoordinates ? undefined : city,
      latitude: hasCoordinates ? latitude : undefined,
      limit: GATHERING_RESULT_LIMIT,
      longitude: hasCoordinates ? longitude : undefined,
      radius_km: hasCoordinates ? 40 : undefined,
      starts_after: new Date().toISOString(),
    },
  }));
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
