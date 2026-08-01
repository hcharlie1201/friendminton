import { apiBaseUrl } from '../../config';

export function profileImageUrl(value?: string | null) {
  if (!value) return null;
  return value.startsWith('/') ? `${apiBaseUrl}${value}` : value;
}
