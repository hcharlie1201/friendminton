import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getApiGatherings, type Gathering } from '../../api/generated';
import { authHeaders, unwrap } from '../../api/runtime';

type Options = {
  city: string;
  enabled: boolean;
  skillLevel: string | null;
  userId: string;
};

const GATHERING_RESULT_LIMIT = 30;

export function useGatheringDiscovery({ city, enabled, skillLevel, userId }: Options) {
  const query = useQuery({
    enabled,
    queryKey: ['gatherings', userId, city],
    queryFn: () => loadGatherings(city, userId),
  });
  const gatherings = useMemo(
    () => filterGatheringsForLevel(query.data ?? [], skillLevel),
    [query.data, skillLevel],
  );

  return { ...query, gatherings };
}

function loadGatherings(city: string, userId: string) {
  return getApiGatherings({
    headers: authHeaders(userId),
    query: {
      city,
      limit: GATHERING_RESULT_LIMIT,
      starts_after: new Date().toISOString(),
    },
  }).then(unwrap<Gathering[]>);
}

function filterGatheringsForLevel(gatherings: Gathering[], skillLevel: string | null) {
  if (!skillLevel) return gatherings;
  return gatherings.filter((gathering) => !gathering.skill_level || gathering.skill_level === skillLevel);
}
