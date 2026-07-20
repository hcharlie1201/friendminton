import { TextField } from '../ui';
import { GatheringFormSection } from './GatheringFormPrimitives';

type Props = {
  city: string;
  onCityChange: (value: string) => void;
  onVenueChange: (value: string) => void;
  venue: string;
};

export function GatheringLocationFields({ city, onCityChange, onVenueChange, venue }: Props) {
  return (
    <GatheringFormSection icon="location-outline" title="Where">
      <TextField
        accessibilityLabel="Venue"
        maxLength={200}
        onChangeText={onVenueChange}
        placeholder="East Bay Badminton Center"
        value={venue}
      />
      <TextField
        accessibilityLabel="City"
        maxLength={100}
        onChangeText={onCityChange}
        placeholder="City"
        value={city}
      />
    </GatheringFormSection>
  );
}
