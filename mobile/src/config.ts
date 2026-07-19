const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export type AppEnvironment = 'development' | 'staging' | 'production';

export const appEnvironment = parseEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
export const apiBaseUrl = resolveApiBaseUrl(appEnvironment, process.env.EXPO_PUBLIC_API_BASE_URL);

function parseEnvironment(value?: string): AppEnvironment {
  if (!value || value === 'development') return 'development';
  if (value === 'staging' || value === 'production') return value;
  throw new Error(`Unsupported EXPO_PUBLIC_APP_ENV: ${value}`);
}

function resolveApiBaseUrl(environment: AppEnvironment, value?: string) {
  if (!value && environment !== 'development') {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL is required for ${environment}`);
  }

  const url = trimTrailingSlash(value ?? 'http://localhost:3000');
  if (environment !== 'development' && !url.startsWith('https://')) {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL must use HTTPS for ${environment}`);
  }

  return url;
}
