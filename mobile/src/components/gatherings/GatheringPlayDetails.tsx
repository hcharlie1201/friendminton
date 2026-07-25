import { useCallback } from 'react';

import type {
  GatheringCourtSetup,
  GatheringPlayFormat,
  GatheringRankedLevel,
} from '../../features/gatherings/gatheringDraft';
import { GatheringChoiceGroup, type GatheringChoiceOption } from './GatheringChoiceGroup';
import {
  GatheringFieldLabel,
  GatheringFormSection,
  GatheringLabeledInput,
} from './GatheringFormPrimitives';

const playFormatOptions: GatheringChoiceOption<GatheringPlayFormat>[] = [
  { label: 'Open play', value: 'open_play' },
  { label: 'Round robin', value: 'round_robin' },
  { label: 'Doubles', value: 'doubles' },
  { label: 'Singles', value: 'singles' },
  { label: 'Drills', value: 'drills' },
  { label: 'Coaching', value: 'coaching' },
];

const skillOptions: GatheringChoiceOption<GatheringRankedLevel>[] = [
  { label: 'E', value: 'e' },
  { label: 'E+', value: 'e_plus' },
  { label: 'D', value: 'd' },
  { label: 'C', value: 'c' },
  { label: 'B', value: 'b' },
  { label: 'A', value: 'a' },
];

const skillRangeModeOptions: GatheringChoiceOption<'all' | 'range'>[] = [
  { description: 'Everyone is welcome.', label: 'All levels', value: 'all' },
  { description: 'Choose lowest and highest.', label: 'Set a range', value: 'range' },
];

const rankedLevels: GatheringRankedLevel[] = skillOptions.map((option) => option.value);

const courtSetupOptions: GatheringChoiceOption<GatheringCourtSetup>[] = [
  { description: 'Players check in and pay at the venue.', label: 'Drop-in', value: 'drop_in' },
  { description: 'The host has courts booked for the group.', label: 'Courts reserved', value: 'reserved' },
];

type Props = {
  courtCount: string;
  courtSetup: GatheringCourtSetup;
  onCourtCountChange: (value: string) => void;
  onCourtSetupChange: (value: GatheringCourtSetup) => void;
  onFormatChange: (value: GatheringPlayFormat) => void;
  onSkillMaxChange: (value: GatheringRankedLevel | null) => void;
  onSkillMinChange: (value: GatheringRankedLevel | null) => void;
  playFormat: GatheringPlayFormat;
  skillLevelMax: GatheringRankedLevel | null;
  skillLevelMin: GatheringRankedLevel | null;
};

export function GatheringPlayDetails({
  courtCount,
  courtSetup,
  onCourtCountChange,
  onCourtSetupChange,
  onFormatChange,
  onSkillMaxChange,
  onSkillMinChange,
  playFormat,
  skillLevelMax,
  skillLevelMin,
}: Props) {
  const skillRange = useSkillRangeActions({
    maximum: skillLevelMax,
    minimum: skillLevelMin,
    onMaximumChange: onSkillMaxChange,
    onMinimumChange: onSkillMinChange,
  });
  return (
    <GatheringFormSection
      icon="flash-outline"
      subtitle="Give players enough context to know whether the session fits."
      title="On court"
    >
      <GatheringFieldLabel>Format</GatheringFieldLabel>
      <GatheringChoiceGroup onChange={onFormatChange} options={playFormatOptions} value={playFormat} />
      <GatheringFieldLabel>Player level</GatheringFieldLabel>
      <GatheringChoiceGroup
        onChange={skillRange.setMode}
        options={skillRangeModeOptions}
        value={skillRange.mode}
      />
      {skillRange.mode === 'range' && (
        <>
          <GatheringFieldLabel>Lowest accepted · {skillLevelLabel(skillLevelMin)}</GatheringFieldLabel>
          <GatheringChoiceGroup
            onChange={skillRange.setMinimum}
            options={skillOptions}
            value={skillLevelMin ?? 'e'}
          />
          <GatheringFieldLabel>Highest accepted · {skillLevelLabel(skillLevelMax)}</GatheringFieldLabel>
          <GatheringChoiceGroup
            onChange={skillRange.setMaximum}
            options={skillOptions}
            value={skillLevelMax ?? 'a'}
          />
        </>
      )}
      <GatheringFieldLabel>Court setup</GatheringFieldLabel>
      <GatheringChoiceGroup onChange={onCourtSetupChange} options={courtSetupOptions} value={courtSetup} />
      {courtSetup === 'reserved' && (
        <GatheringLabeledInput
          keyboardType="number-pad"
          label="Number of courts"
          onChangeText={onCourtCountChange}
          placeholder="2"
          value={courtCount}
        />
      )}
    </GatheringFormSection>
  );
}

function useSkillRangeActions({
  maximum,
  minimum,
  onMaximumChange,
  onMinimumChange,
}: {
  maximum: GatheringRankedLevel | null;
  minimum: GatheringRankedLevel | null;
  onMaximumChange: (value: GatheringRankedLevel | null) => void;
  onMinimumChange: (value: GatheringRankedLevel | null) => void;
}) {
  const setMode = useCallback((mode: 'all' | 'range') => {
    onMinimumChange(mode === 'range' ? 'e' : null);
    onMaximumChange(mode === 'range' ? 'a' : null);
  }, [onMaximumChange, onMinimumChange]);
  const setMinimum = useCallback((value: GatheringRankedLevel) => {
    onMinimumChange(value);
    if (!maximum || levelIndex(value) > levelIndex(maximum)) onMaximumChange(value);
  }, [maximum, onMaximumChange, onMinimumChange]);
  const setMaximum = useCallback((value: GatheringRankedLevel) => {
    onMaximumChange(value);
    if (!minimum || levelIndex(value) < levelIndex(minimum)) onMinimumChange(value);
  }, [minimum, onMaximumChange, onMinimumChange]);

  return {
    mode: minimum === null && maximum === null ? 'all' as const : 'range' as const,
    setMaximum,
    setMinimum,
    setMode,
  };
}

function levelIndex(level: GatheringRankedLevel) {
  return rankedLevels.indexOf(level);
}

function skillLevelLabel(level: GatheringRankedLevel | null) {
  if (!level) return '';
  return level === 'e_plus' ? 'E+' : level.toUpperCase();
}
