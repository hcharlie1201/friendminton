import type { GatheringKind } from '../../features/gatherings/gatheringDraft';
import { GatheringChoiceGroup, type GatheringChoiceOption } from './GatheringChoiceGroup';
import { GatheringFormSection } from './GatheringFormPrimitives';

const kindOptions: GatheringChoiceOption<GatheringKind>[] = [
  { description: 'Badminton is the main event', label: 'Play', value: 'play' },
  { description: 'Hang with the badminton crowd', label: 'Social', value: 'social' },
  { description: 'Rally first, hang after', label: 'Play + social', value: 'play_and_social' },
];

export function GatheringKindPicker({
  onChange,
  value,
}: {
  onChange: (value: GatheringKind) => void;
  value: GatheringKind;
}) {
  return (
    <GatheringFormSection
      subtitle="Choose the main reason everyone is getting together."
      title="What are you hosting?"
    >
      <GatheringChoiceGroup onChange={onChange} options={kindOptions} value={value} />
    </GatheringFormSection>
  );
}
