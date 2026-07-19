import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getApiUsers, type Player } from '../../api/generated';
import { unwrap } from '../../api/runtime';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const SEARCH_DEBOUNCE_MS = 300;

type PlayerSearchOptions = {
  city: string;
  enabled: boolean;
  query: string;
  skillLevel: string;
};

export function usePlayerSearch({ city, enabled, query, skillLevel }: PlayerSearchOptions) {
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, SEARCH_DEBOUNCE_MS);
  const effectiveQuery = normalizedQuery.length === 0 ? '' : debouncedQuery;
  const result = useQuery<Player[]>({
    enabled,
    placeholderData: keepPreviousData,
    queryKey: ['players', 'search', { city, query: effectiveQuery, skillLevel }],
    queryFn: ({ signal }) =>
      getApiUsers({
        query: {
          city,
          query: effectiveQuery || undefined,
          skill_level: skillLevel,
        },
        signal,
      }).then(unwrap<Player[]>),
    staleTime: 30_000,
  });

  return {
    ...result,
    effectiveQuery,
    isSearching: normalizedQuery !== effectiveQuery || result.isFetching,
  };
}
