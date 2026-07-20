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
  error?: unknown;
  response?: Response;
};

generatedClient.setConfig({ baseUrl: apiBaseUrl });
configureDevelopmentLogging();

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
    throw isErrorBody(error) ? appErrorFromResponse(error, response?.status) : error;
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
    throw isErrorBody(error) ? appErrorFromResponse(error, response?.status) : error;
  }

  if (response && !response.ok) {
    throw appErrorFromStatus(`Request failed with status ${response.status}`, response.status);
  }
}

function isErrorBody(error: unknown): error is ErrorBody {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<ErrorBody>;
  return typeof candidate.code === 'string' && typeof candidate.error === 'string';
}

function configureDevelopmentLogging() {
  if (!__DEV__) return;

  console.info('[Friendminton:api] configured', { baseUrl: apiBaseUrl });
  generatedClient.interceptors.request.use((request) => {
    console.info('[Friendminton:api] request', requestSummary(request));
    return request;
  });
  generatedClient.interceptors.response.use((response, request) => {
    console.info('[Friendminton:api] response', {
      ...requestSummary(request),
      status: response.status,
    });
    return response;
  });
  generatedClient.interceptors.error.use((error, response, request) => {
    console.info('[Friendminton:api] failure', {
      ...(request ? requestSummary(request) : { baseUrl: apiBaseUrl }),
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      status: response?.status ?? null,
    });
    return error;
  });
}

function requestSummary(request: Request) {
  const url = new URL(request.url);
  return {
    endpoint: `${url.origin}${url.pathname}`,
    method: request.method,
    queryKeys: [...url.searchParams.keys()],
  };
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
