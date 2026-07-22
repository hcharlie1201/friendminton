import { useQuery } from '@tanstack/react-query';

import { getApiGatherings, type Gathering } from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';

const HOSTED_GATHERING_LIMIT = 100;

export function useHostedGatherings(userId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(userId),
    queryKey: ['gatherings', 'hosted', userId],
    queryFn: () => loadHostedGatherings(userId),
  });
}

async function loadHostedGatherings(userId: string) {
  const gatherings = await apiData<Gathering[]>(getApiGatherings({
    headers: authHeaders(userId),
    query: {
      limit: HOSTED_GATHERING_LIMIT,
    },
  }));
  return gatherings
    .filter((gathering) => gathering.host_id === userId)
    .sort(compareHostedGatherings);
}

function compareHostedGatherings(left: Gathering, right: Gathering) {
  const now = Date.now();
  const leftStart = new Date(left.starts_at).getTime();
  const rightStart = new Date(right.starts_at).getTime();
  const leftIsUpcoming = leftStart >= now;
  const rightIsUpcoming = rightStart >= now;

  if (leftIsUpcoming !== rightIsUpcoming) return leftIsUpcoming ? -1 : 1;
  return leftIsUpcoming ? leftStart - rightStart : rightStart - leftStart;
}
