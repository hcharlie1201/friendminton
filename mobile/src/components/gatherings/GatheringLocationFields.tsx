import { LocationAutocomplete, type SelectedLocation } from '../location';
import { GatheringFormSection } from './GatheringFormPrimitives';

type Props = {
  onLocationChange: (value: SelectedLocation) => void;
  value: SelectedLocation | null;
};

export function GatheringLocationFields({ onLocationChange, value }: Props) {
  return (
    <GatheringFormSection icon="location-outline" title="Where">
      <LocationAutocomplete onSelect={onLocationChange} value={value} />
    </GatheringFormSection>
  );
}
