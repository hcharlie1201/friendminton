import type { FeedPost } from '../../api/generated';
import { apiBaseUrl } from '../../config';

export type DraftPhoto = {
  fileName?: string | null;
  mimeType?: string | null;
  objectKey?: string;
  uri: string;
};

export type PostDraft = {
  body: string;
  effort: number | null;
  location: string;
  photos: DraftPhoto[];
};

export const emptyPostDraft: PostDraft = {
  body: '',
  effort: null,
  location: '',
  photos: [],
};

export function draftFromPost(post: FeedPost): PostDraft {
  return {
    body: post.body ?? '',
    effort: post.effort ?? null,
    location: post.location ?? '',
    photos: (post.image_urls ?? []).map((imageUrl, index) => ({
      objectKey: post.image_keys?.[index],
      uri: postImageUrl(imageUrl),
    })),
  };
}

export function postImageUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') ? value : `${apiBaseUrl}${value}`;
}
