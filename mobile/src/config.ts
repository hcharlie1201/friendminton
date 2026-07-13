const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const apiBaseUrl = trimTrailingSlash(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
);
