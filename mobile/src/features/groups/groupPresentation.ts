import { apiBaseUrl } from '../../config';

export function resolveGroupCoverUrl(value: string | null | undefined) {
  if (!value || value.startsWith('http://') || value.startsWith('https://')) return value;
  return `${apiBaseUrl}${value}`;
}
