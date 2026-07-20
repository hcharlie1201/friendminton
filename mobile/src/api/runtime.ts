import { client as generatedClient } from './generated/client.gen';
import type { ErrorBody } from './generated';
import {
  AppError,
  AppErrorKind,
  appErrorFromStatus,
  normalizeAppError,
} from '../common/errors';
import { apiBaseUrl } from '../config';

export type ApiResult<T> = {
  data?: T;
  error?: ErrorBody;
  response?: Response;
};

generatedClient.setConfig({ baseUrl: apiBaseUrl });

export function authHeaders(userId: string) {
  return { 'x-user-id': userId };
}

export async function apiData<T>(request: PromiseLike<ApiResult<T>>) {
  try {
    return dataFromResult(await request);
  } catch (error) {
    throw normalizeAppError(error);
  }
}

export async function apiSuccess(request: PromiseLike<ApiResult<unknown>>) {
  try {
    assertSuccessfulResult(await request);
  } catch (error) {
    throw normalizeAppError(error);
  }
}

function dataFromResult<T>({ data, error, response }: ApiResult<T>) {
  if (error) {
    throw appErrorFromResponse(error, response?.status);
  }

  if (response && !response.ok) {
    throw appErrorFromStatus(`Request failed with status ${response.status}`, response.status);
  }

  if (data === undefined) {
    throw new AppError(AppErrorKind.EmptyResponse, 'Request did not return data.', {
      status: response?.status,
    });
  }

  return data;
}

function assertSuccessfulResult({ error, response }: ApiResult<unknown>) {
  if (error) {
    throw appErrorFromResponse(error, response?.status);
  }

  if (response && !response.ok) {
    throw appErrorFromStatus(`Request failed with status ${response.status}`, response.status);
  }
}

function appErrorFromResponse(error: ErrorBody, status?: number) {
  const message = error.error ?? `Request failed with status ${status ?? 'unknown'}`;
  switch (error.code) {
    case 'bad_request':
      return new AppError(AppErrorKind.Validation, message, { status });
    case 'unauthorized':
      return new AppError(AppErrorKind.Authentication, message, { status });
    case 'not_found':
      return new AppError(AppErrorKind.NotFound, message, { status });
    case 'internal_server_error':
      return new AppError(AppErrorKind.Server, message, { status });
    case 'service_unavailable':
      return new AppError(AppErrorKind.ServiceUnavailable, message, { status });
    case 'upstream_service_error':
      return new AppError(AppErrorKind.UpstreamService, message, { status });
    default:
      return appErrorFromStatus(message, status);
  }
}
