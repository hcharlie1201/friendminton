import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  getApiDiscovery,
  type DiscoveryCategory,
  type DiscoveryPage,
  type DiscoveryResult,
} from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const SEARCH_DEBOUNCE_MS = 300;
const DISCOVERY_PAGE_SIZE = 20;

type Options = {
  category: DiscoveryCategory;
  city: string;
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  query: string;
  skillLevel: string | null;
  userId: string;
};

export function useUnifiedDiscovery({
  category,
  city,
  enabled,
  latitude,
  longitude,
  query,
  skillLevel,
  userId,
}: Options) {
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, SEARCH_DEBOUNCE_MS);
  const effectiveQuery = normalizedQuery.length === 0 ? '' : debouncedQuery;
  const result = useInfiniteQuery({
    enabled: enabled && effectiveQuery.length > 0,
    initialPageParam: null as string | null,
    queryKey: [
      'discovery',
      'search',
      { category, city, latitude, longitude, query: effectiveQuery, skillLevel, userId },
    ],
    queryFn: ({ pageParam, signal }) =>
      apiData<DiscoveryPage>(getApiDiscovery({
        headers: authHeaders(userId),
        query: {
          category,
          city,
          cursor: pageParam,
          latitude,
          limit: DISCOVERY_PAGE_SIZE,
          longitude,
          query: effectiveQuery,
          radius_km: latitude !== null && longitude !== null ? 40 : undefined,
          skill_level: skillLevel,
        },
        signal,
      })),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const items = useMemo<DiscoveryResult[]>(
    () => result.data?.pages.flatMap((page) => page.items) ?? [],
    [result.data],
  );

  return {
    ...result,
    effectiveQuery,
    isSearching: normalizedQuery !== effectiveQuery || result.isFetching,
    items,
  };
}
