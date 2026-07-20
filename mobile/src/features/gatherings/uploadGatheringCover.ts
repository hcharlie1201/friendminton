import { uploadImage } from '../uploads/uploadImage';
import type { GatheringCoverPhoto } from './gatheringDraft';

export async function uploadGatheringCover(userId: string, photo: GatheringCoverPhoto) {
  return uploadImage({
    failureLabel: 'Cover',
    mimeType: photo.mimeType,
    purpose: 'gathering_cover',
    uri: photo.uri,
    userId,
  });
}
