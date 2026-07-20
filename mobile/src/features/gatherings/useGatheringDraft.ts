import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import {
  createInitialGatheringDraft,
  type GatheringCoverPhoto,
  type GatheringDraft,
  type GatheringKind,
  type GatheringPlayFormat,
  type GatheringSkillLevel,
  type GatheringSocialTag,
  type GatheringThemeId,
  type GatheringVisibility,
} from './gatheringDraft';

export function useGatheringDraft(city: string, kind: GatheringKind) {
  const [initialValue] = useState(() => createInitialGatheringDraft(city, kind));
  const [value, setValue] = useState(initialValue);
  const setTitle = useDraftTextSetter(setValue, 'title');
  const setVenue = useDraftTextSetter(setValue, 'venue');
  const setCity = useDraftTextSetter(setValue, 'city');
  const setDescription = useDraftTextSetter(setValue, 'description');
  const setCapacity = useDraftTextSetter(setValue, 'capacity');
  const setCostPerPerson = useDraftTextSetter(setValue, 'costPerPerson');
  const setCourtCount = useDraftTextSetter(setValue, 'courtCount');
  const setKind = useCallback((next: GatheringKind) => {
    setValue((current) => ({
      ...current,
      kind: next,
      socialTags: next === 'play' ? [] : current.socialTags.length > 0 ? current.socialTags : ['food'],
    }));
  }, []);
  const setTheme = useCallback((theme: GatheringThemeId) => {
    setValue((current) => ({ ...current, theme }));
  }, []);
  const setCoverPhoto = useCallback((coverPhoto: GatheringCoverPhoto | null) => {
    setValue((current) => ({ ...current, coverPhoto }));
  }, []);
  const setStartsAt = useCallback((startsAt: Date) => {
    setValue((current) => {
      const endsAt = current.endsAt <= startsAt
        ? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000)
        : current.endsAt;
      return { ...current, endsAt, startsAt };
    });
  }, []);
  const setEndsAt = useCallback((endsAt: Date) => {
    setValue((current) => ({ ...current, endsAt }));
  }, []);
  const setVisibility = useCallback((visibility: GatheringVisibility) => {
    setValue((current) => ({
      ...current,
      joinPolicy: visibility === 'private' ? 'invite_only' : 'open',
      visibility,
    }));
  }, []);
  const setPlayFormat = useCallback((playFormat: GatheringPlayFormat) => {
    setValue((current) => ({ ...current, playFormat }));
  }, []);
  const setSkillLevel = useCallback((skillLevel: GatheringSkillLevel) => {
    setValue((current) => ({ ...current, skillLevel }));
  }, []);
  const toggleSocialTag = useCallback((tag: GatheringSocialTag) => {
    setValue((current) => ({
      ...current,
      socialTags: current.socialTags.includes(tag)
        ? current.socialTags.filter((candidate) => candidate !== tag)
        : [...current.socialTags, tag],
    }));
  }, []);

  return {
    isDirty: gatheringDraftFingerprint(value) !== gatheringDraftFingerprint(initialValue),
    setCapacity,
    setCity,
    setCostPerPerson,
    setCourtCount,
    setCoverPhoto,
    setDescription,
    setEndsAt,
    setKind,
    setPlayFormat,
    setSkillLevel,
    setStartsAt,
    setTheme,
    setTitle,
    setVenue,
    setVisibility,
    toggleSocialTag,
    value,
  };
}

function gatheringDraftFingerprint(draft: GatheringDraft) {
  return JSON.stringify({
    ...draft,
    endsAt: draft.endsAt.toISOString(),
    startsAt: draft.startsAt.toISOString(),
  });
}

function useDraftTextSetter<K extends keyof GatheringDraft>(
  setDraft: Dispatch<SetStateAction<GatheringDraft>>,
  key: K,
) {
  return useCallback((next: string) => {
    setDraft((current) => ({ ...current, [key]: next }));
  }, [key, setDraft]);
}
