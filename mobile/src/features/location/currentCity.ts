import * as Location from 'expo-location';

export class LocationPermissionError extends Error {}
export class LocationUnavailableError extends Error {}

export async function getCurrentCity() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new LocationPermissionError('Location permission was not granted.');
  }

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [place] = await Location.reverseGeocodeAsync(position.coords);
  const city = formatCity(place);

  if (!city) {
    throw new LocationUnavailableError('No city was found for the current location.');
  }

  return city;
}

export function formatCity(place?: Location.LocationGeocodedAddress) {
  if (!place) return '';

  const city = place.city ?? place.subregion ?? place.region;
  const region = place.region && place.region !== city ? place.region : undefined;
  return [city, region].filter(Boolean).join(', ');
}
