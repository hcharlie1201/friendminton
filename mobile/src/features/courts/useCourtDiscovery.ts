import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { getApiCourts, type Court } from '../../api/generated';
import { apiData } from '../../api/runtime';

type CourtQueryKey = readonly ['courts', 'discover', number | null, number | null];

type Options = {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
};

const COURT_RADIUS_KM = 40;

export function useCourtDiscovery({ enabled, latitude, longitude }: Options) {
  return useQuery({
    enabled,
    queryFn: loadCourts,
    queryKey: ['courts', 'discover', latitude, longitude] satisfies CourtQueryKey,
    staleTime: 5 * 60 * 1000,
  });
}

function loadCourts({ queryKey }: QueryFunctionContext<CourtQueryKey>) {
  const [, , latitude, longitude] = queryKey;
  const hasCoordinates = latitude !== null && longitude !== null;
  return apiData<Court[]>(getApiCourts({
    query: {
      latitude: hasCoordinates ? latitude : undefined,
      limit: 40,
      longitude: hasCoordinates ? longitude : undefined,
      radius_km: hasCoordinates ? COURT_RADIUS_KM : undefined,
    },
  }));
}
