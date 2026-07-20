import type {
  GatheringCourtSetup,
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
  { label: 'Round robin', value: 'round_robin' },
  { label: 'Doubles', value: 'doubles' },
  { label: 'Singles', value: 'singles' },
  { label: 'Drills', value: 'drills' },
  { label: 'Coaching', value: 'coaching' },
];

const skillOptions: GatheringChoiceOption<GatheringSkillLevel>[] = [
  { label: 'All levels', value: 'all_levels' },
  { label: 'Beginner', value: 'beginner' },
  { label: 'E', value: 'e' },
  { label: 'E+', value: 'e_plus' },
  { label: 'D', value: 'd' },
  { label: 'C', value: 'c' },
  { label: 'B', value: 'b' },
  { label: 'A', value: 'a' },
];

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
  onSkillChange: (value: GatheringSkillLevel) => void;
  playFormat: GatheringPlayFormat;
  skillLevel: GatheringSkillLevel;
};

export function GatheringPlayDetails({
  courtCount,
  courtSetup,
  onCourtCountChange,
  onCourtSetupChange,
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
