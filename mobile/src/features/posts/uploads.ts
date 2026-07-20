import { uploadImage } from '../uploads/uploadImage';
import type { DraftPhoto } from './postDraft';

export async function uploadPostPhotos(userId: string, photos: DraftPhoto[]) {
  return Promise.all(photos.map((photo) => photo.objectKey ?? uploadPostPhoto(userId, photo)));
}

async function uploadPostPhoto(userId: string, photo: DraftPhoto) {
  return uploadImage({
    failureLabel: 'Photo',
    mimeType: photo.mimeType,
    purpose: 'post',
    uri: photo.uri,
    userId,
  });
}
