import { GatheringFormSection } from './GatheringFormPrimitives';
import { GatheringScheduleFields } from './GatheringScheduleFields';

type Props = {
  endsAt: Date;
  onEndsAtChange: (value: Date) => void;
  onStartsAtChange: (value: Date) => void;
  startsAt: Date;
};

export function GatheringScheduleSection(props: Props) {
  return (
    <GatheringFormSection icon="calendar-outline" title="When">
      <GatheringScheduleFields {...props} />
    </GatheringFormSection>
  );
}
