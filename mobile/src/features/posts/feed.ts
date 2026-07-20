import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { FeedPage, FeedPost } from '../../api/generated';

export const feedQueryKey = ['feed', 'pages'] as const;

export function findCachedFeedPost(queryClient: QueryClient, postId: string) {
  const feed = queryClient.getQueryData<InfiniteData<FeedPage>>(feedQueryKey);
  return feed?.pages.flatMap((page) => page.items).find((post) => post.id === postId);
}
