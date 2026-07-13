const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const apiBaseUrl = trimTrailingSlash(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
);

export const devUserId = process.env.EXPO_PUBLIC_DEV_USER_ID?.trim() || undefined;
