import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { postApiGatherings, type CreateGathering, type Gathering } from '../../api/generated';
import { authHeaders, unwrap } from '../../api/runtime';
import {
  isPlayGathering,
  isSocialGathering,
  type GatheringCoverPhoto,
  type GatheringDraft,
} from './gatheringDraft';
import { uploadGatheringCover } from './uploadGatheringCover';

export function useGatheringPublisher(
  draft: GatheringDraft,
  userId: string,
  allowCreatorRemoval: () => void,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutationFn = useCallback(() => createGathering(draft, userId), [draft, userId]);
  const mutation = useMutation({
    mutationFn,
    onError: showCreateError,
    onSuccess: async (gathering) => {
      await queryClient.invalidateQueries({ queryKey: ['gatherings'] });
      const destination = gathering.visibility === 'public' ? 'live in Discover' : 'published privately';
      Alert.alert('Gathering published', `${gathering.title} is ${destination}.`);
      allowCreatorRemoval();
      router.back();
    },
  });
  const submit = useCallback(() => {
    const error = validateGatheringDraft(draft, userId);
    if (error) {
      Alert.alert('Finish your gathering', error);
      return;
    }
    mutation.mutate();
  }, [draft, mutation.mutate, userId]);

  return {
    canSubmit: Boolean(userId && draft.title.trim() && draft.venue.trim() && draft.city.trim()),
    isPending: mutation.isPending,
    submit,
  };
}

export function useGatheringCreatorClose(isDirty: boolean) {
  const navigation = useNavigation();
  const router = useRouter();
  const allowRemoval = useRef(false);
  const pendingRemoval = useRef<(() => void) | null>(null);
  const discardPendingRemoval = useCallback(() => {
    const remove = pendingRemoval.current;
    pendingRemoval.current = null;
    allowRemoval.current = true;
    remove?.();
  }, []);
  const clearPendingRemoval = useCallback(() => {
    pendingRemoval.current = null;
  }, []);
  const removeCreator = useCallback(() => {
    allowRemoval.current = true;
    router.back();
  }, [router]);
  const allowNextRemoval = useCallback(() => {
    allowRemoval.current = true;
  }, []);
  const requestClose = useCallback(() => {
    if (!isDirty) {
      removeCreator();
      return;
    }
    showDiscardConfirmation(removeCreator);
  }, [isDirty, removeCreator]);
  const preventUnhandledRemoval = useCallback((event: { data: { action: unknown }; preventDefault: () => void }) => {
    if (!isDirty || allowRemoval.current) return;
    event.preventDefault();
    pendingRemoval.current = () => navigation.dispatch(event.data.action as never);
    showDiscardConfirmation(discardPendingRemoval, clearPendingRemoval);
  }, [clearPendingRemoval, discardPendingRemoval, isDirty, navigation]);

  useEffect(
    () => navigation.addListener('beforeRemove', preventUnhandledRemoval),
    [navigation, preventUnhandledRemoval],
  );

  return { allowNextRemoval, requestClose };
}

export function useGatheringCoverPicker(onChange: (photo: GatheringCoverPhoto | null) => void) {
  return useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        mediaTypes: ['images'],
        quality: 0.88,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      onChange({ fileName: asset.fileName, mimeType: asset.mimeType, uri: asset.uri });
    } catch (error) {
      showCreateError(error);
    }
  }, [onChange]);
}

export function validateGatheringDraft(draft: GatheringDraft, userId: string) {
  if (!userId) return 'Sign in again before publishing.';
  if (!draft.title.trim()) return 'Add a title.';
  if (!draft.venue.trim()) return 'Add a venue.';
  if (!draft.city.trim()) return 'Add a city.';
  if (draft.endsAt <= draft.startsAt) return 'The end time must be after the start time.';
  if (draft.startsAt <= new Date()) return 'Choose a start time in the future.';
  if (draft.capacity.trim() && parseOptionalInteger(draft.capacity) === null) return 'Spots must be a whole number.';
  if (isPlayGathering(draft.kind) && parseOptionalInteger(draft.courtCount) === null) return 'Add at least one court.';
  if (parseCostInCents(draft.costPerPerson) < 0) return 'Cost cannot be negative.';
  return null;
}

async function createGathering(draft: GatheringDraft, userId: string) {
  const coverImageKey = draft.coverPhoto
    ? await uploadGatheringCover(userId, draft.coverPhoto)
    : null;
  const payload: CreateGathering = {
    capacity: parseOptionalInteger(draft.capacity),
    city: draft.city.trim(),
    cost_per_person_cents: parseCostInCents(draft.costPerPerson),
    court_count: isPlayGathering(draft.kind) ? parseOptionalInteger(draft.courtCount) : null,
    cover_image_key: coverImageKey,
    currency: 'USD',
    description: draft.description.trim() || null,
    ends_at: draft.endsAt.toISOString(),
    join_policy: draft.joinPolicy,
    kind: draft.kind,
    play_format: isPlayGathering(draft.kind) ? draft.playFormat : null,
    skill_level: isPlayGathering(draft.kind) && draft.skillLevel !== 'all_levels' ? draft.skillLevel : null,
    social_tags: isSocialGathering(draft.kind) ? draft.socialTags : [],
    starts_at: draft.startsAt.toISOString(),
    theme: draft.theme,
    title: draft.title.trim(),
    venue: draft.venue.trim(),
    visibility: draft.visibility,
  };

  return postApiGatherings({ body: payload, headers: authHeaders(userId) }).then(unwrap<Gathering>);
}

function parseOptionalInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseCostInCents(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value.replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : -1;
}

function showCreateError(error: unknown) {
  Alert.alert('Could not publish', error instanceof Error ? error.message : 'Something went wrong.');
}

function showDiscardConfirmation(onDiscard: () => void, onCancel?: () => void) {
  Alert.alert('Discard this gathering?', 'Your draft has not been published.', [
    { onPress: onCancel, style: 'cancel', text: 'Keep editing' },
    { onPress: onDiscard, style: 'destructive', text: 'Discard' },
  ]);
}
