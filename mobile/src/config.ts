import Constants from 'expo-constants';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export type AppEnvironment = 'development' | 'staging' | 'production';

export const appEnvironment = parseEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
export const apiBaseUrl = resolveApiBaseUrl(
  appEnvironment,
  process.env.EXPO_PUBLIC_API_BASE_URL,
  Constants.expoConfig?.hostUri,
);

function parseEnvironment(value?: string): AppEnvironment {
  if (!value || value === 'development') return 'development';
  if (value === 'staging' || value === 'production') return value;
  throw new Error(`Unsupported EXPO_PUBLIC_APP_ENV: ${value}`);
}

function resolveApiBaseUrl(environment: AppEnvironment, value?: string, expoHostUri?: string) {
  if (!value && environment !== 'development') {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL is required for ${environment}`);
  }

  const configuredUrl = trimTrailingSlash(value ?? 'http://localhost:3000');
  const url = environment === 'development'
    ? replaceLoopbackWithExpoHost(configuredUrl, expoHostUri)
    : configuredUrl;
  if (environment !== 'development' && !url.startsWith('https://')) {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL must use HTTPS for ${environment}`);
  }

  return url;
}

function replaceLoopbackWithExpoHost(url: string, expoHostUri?: string) {
  const expoHost = expoHostUri?.split(':')[0];
  if (!expoHost || expoHost === 'localhost' || expoHost === '127.0.0.1') return url;

  return url.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, `http://${expoHost}`);
}
