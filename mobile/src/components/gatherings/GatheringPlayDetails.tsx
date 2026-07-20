import type {
  GatheringPlayFormat,
  GatheringSkillLevel,
} from '../../features/gatherings/gatheringDraft';
import { GatheringChoiceGroup, type GatheringChoiceOption } from './GatheringChoiceGroup';
import {
  GatheringFieldLabel,
  GatheringFormSection,
  GatheringLabeledInput,
} from './GatheringFormPrimitives';

const playFormatOptions: GatheringChoiceOption<GatheringPlayFormat>[] = [
  { label: 'Open play', value: 'open_play' },
  { label: 'Doubles', value: 'doubles' },
  { label: 'Singles', value: 'singles' },
  { label: 'Drills', value: 'drills' },
  { label: 'Coaching', value: 'coaching' },
];

const skillOptions: GatheringChoiceOption<GatheringSkillLevel>[] = [
  { label: 'All levels', value: 'all_levels' },
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
  { label: 'Competitive', value: 'competitive' },
];

type Props = {
  courtCount: string;
  onCourtCountChange: (value: string) => void;
  onFormatChange: (value: GatheringPlayFormat) => void;
  onSkillChange: (value: GatheringSkillLevel) => void;
  playFormat: GatheringPlayFormat;
  skillLevel: GatheringSkillLevel;
};

export function GatheringPlayDetails({
  courtCount,
  onCourtCountChange,
  onFormatChange,
  onSkillChange,
  playFormat,
  skillLevel,
}: Props) {
  return (
    <GatheringFormSection
      icon="flash-outline"
      subtitle="Give players enough context to know whether the session fits."
      title="On court"
    >
      <GatheringFieldLabel>Format</GatheringFieldLabel>
      <GatheringChoiceGroup onChange={onFormatChange} options={playFormatOptions} value={playFormat} />
      <GatheringFieldLabel>Level</GatheringFieldLabel>
      <GatheringChoiceGroup onChange={onSkillChange} options={skillOptions} value={skillLevel} />
      <GatheringLabeledInput
        keyboardType="number-pad"
        label="Courts reserved"
        onChangeText={onCourtCountChange}
        placeholder="2"
        value={courtCount}
      />
    </GatheringFormSection>
  );
}
