import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import type { SessionLocation } from '../../auth/session';
import { errorMessage } from '../../common/errors';
import type {
  DiscoveryLocation,
  DiscoveryPreferences,
  SkillLevel,
} from '../../components/home/types';

type PersistPreferences = (
  location: SessionLocation,
  locationEnabled: boolean,
) => Promise<void>;

export function useDiscoveryPreferences(
  initialLocation: DiscoveryLocation,
  initialLocationEnabled: boolean,
  persistPreferences: PersistPreferences,
) {
  const [location, setLocation] = useState<DiscoveryLocation>(initialLocation);
  const [locationEnabled, setLocationEnabled] = useState(initialLocationEnabled);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);

  const apply = useCallback((preferences: DiscoveryPreferences) => {
    const nextLocation = locationFromPreferences(preferences);
    setLocation(nextLocation);
    setLocationEnabled(preferences.locationEnabled);
    setSkillLevel(preferences.skillLevel);
    void persistPreferences(nextLocation, preferences.locationEnabled)
      .catch(showPersistenceError);
  }, [persistPreferences]);

  const updateLocation = useCallback((nextLocation: DiscoveryLocation) => {
    setLocation(nextLocation);
    setLocationEnabled(true);
    void persistPreferences(nextLocation, true).catch(showPersistenceError);
  }, [persistPreferences]);

  return {
    ...location,
    apply,
    locationEnabled,
    setLocation: updateLocation,
    skillLevel,
  };
}

function locationFromPreferences(preferences: DiscoveryPreferences): DiscoveryLocation {
  return {
    city: preferences.city,
    latitude: preferences.latitude,
    longitude: preferences.longitude,
  };
}

function showPersistenceError(error: unknown) {
  Alert.alert(
    'Could not save discovery preferences',
    errorMessage(error, 'Your selection is active for now, but may not survive an app restart.'),
  );
}
