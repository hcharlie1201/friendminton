import { File } from 'expo-file-system';

import { postApiUploadsPresign, type UploadTarget } from '../../api/generated';
import { ApiError, authHeaders, unwrap } from '../../api/runtime';
import { apiBaseUrl } from '../../config';
import type { GatheringCoverPhoto } from './gatheringDraft';

export async function uploadGatheringCover(userId: string, photo: GatheringCoverPhoto) {
  const file = new File(photo.uri);
  const contentType = file.type || contentTypeFromName(file.name || photo.uri, photo.mimeType);
  const target = await postApiUploadsPresign({
    body: {
      content_type: contentType,
      purpose: 'gathering_cover',
      size_bytes: file.size,
    },
    headers: authHeaders(userId),
  }).then(unwrap<UploadTarget>);
  const isLocalUpload = target.upload_url.startsWith('/');
  const response = await fetch(isLocalUpload ? `${apiBaseUrl}${target.upload_url}` : target.upload_url, {
    body: file,
    headers: {
      ...target.headers,
      ...(isLocalUpload ? authHeaders(userId) : {}),
    },
    method: 'PUT',
  });

  if (!response.ok) {
    throw new ApiError(`Cover upload failed with status ${response.status}`, response.status);
  }

  return target.object_key;
}

function contentTypeFromName(fileName: string, fallback?: string | null) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return fallback?.startsWith('image/') ? fallback : 'image/jpeg';
  }
}
