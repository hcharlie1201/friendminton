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
  workoutId: string | null;
};

export const emptyPostDraft: PostDraft = {
  body: '',
  effort: null,
  location: '',
  photos: [],
  workoutId: null,
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
    workoutId: post.workout_id ?? null,
  };
}

export function postImageUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') ? value : `${apiBaseUrl}${value}`;
}

export function imageUrlForLogs(value: string) {
  try {
    const parsed = new URL(value, apiBaseUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split('?')[0];
  }
}
