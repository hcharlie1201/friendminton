import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'react-native-maps';
  });
  const mapOptions = {
    ...(iosGoogleMapsApiKey ? { iosGoogleMapsApiKey } : {}),
    ...(androidGoogleMapsApiKey ? { androidGoogleMapsApiKey } : {}),
  };

  return {
    ...config,
    extra: {
      ...config.extra,
      googleMapsProvider: iosGoogleMapsApiKey ? 'google' : 'native',
    },
    name: config.name ?? 'Friendminton',
    plugins: [
      ...plugins,
      Object.keys(mapOptions).length > 0
        ? ['react-native-maps', mapOptions]
        : 'react-native-maps',
    ],
    slug: config.slug ?? 'friendminton-mobile',
  };
};
