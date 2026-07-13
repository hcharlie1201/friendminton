import { client as generatedClient } from './generated/client.gen';
import type { ErrorBody } from './generated';
import { apiBaseUrl } from '../config';

type ApiResult<T> = {
  data?: T;
  error?: ErrorBody;
  response?: Response;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

generatedClient.setConfig({ baseUrl: apiBaseUrl });

export function authHeaders(userId: string) {
  return { 'x-user-id': userId };
}

export function unwrap<T>({ data, error, response }: ApiResult<T>) {
  if (error) {
    throw new ApiError(error.error ?? `Request failed with status ${response?.status ?? 'unknown'}`, response?.status);
  }

  if (response && !response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  if (data === undefined) {
    throw new ApiError('Request did not return data', response?.status);
  }

  return data;
}
