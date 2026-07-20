import { File } from 'expo-file-system';

import {
  postApiUploadsPresign,
  type UploadPurpose,
  type UploadTarget,
} from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';
import { AppError, AppErrorKind, normalizeAppError } from '../../common/errors';
import { apiBaseUrl } from '../../config';

type ImageUpload = {
  failureLabel: string;
  mimeType?: string | null;
  purpose: UploadPurpose;
  uri: string;
  userId: string;
};

export async function uploadImage(upload: ImageUpload) {
  try {
    return await performImageUpload(upload);
  } catch (error) {
    throw normalizeAppError(error, `${upload.failureLabel} upload failed.`);
  }
}

async function performImageUpload({
  failureLabel,
  mimeType,
  purpose,
  uri,
  userId,
}: ImageUpload) {
  const file = new File(uri);
  const contentType = file.type || contentTypeFromName(file.name || uri, mimeType);
  const target = await apiData<UploadTarget>(postApiUploadsPresign({
    body: {
      content_type: contentType,
      purpose,
      size_bytes: file.size,
    },
    headers: authHeaders(userId),
  }));
  const isLocalUpload = target.upload_url.startsWith('/');
  const response = await fetch(
    isLocalUpload ? `${apiBaseUrl}${target.upload_url}` : target.upload_url,
    {
      body: file,
      headers: {
        ...target.headers,
        ...(isLocalUpload ? authHeaders(userId) : {}),
      },
      method: 'PUT',
    },
  );

  if (!response.ok) {
    throw new AppError(
      AppErrorKind.Upload,
      `${failureLabel} upload failed with status ${response.status}.`,
      { status: response.status },
    );
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
