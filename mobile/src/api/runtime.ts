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

const API_REQUEST_TIMEOUT_MS = 15_000;
let sessionToken: string | null = null;

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  let didTimeout = false;
  const abortFromSource = () => controller.abort();
  if (sourceSignal?.aborted) {
    abortFromSource();
  } else {
    sourceSignal?.addEventListener('abort', abortFromSource, { once: true });
  }
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);

  try {
    return await globalThis.fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout) {
      throw new AppError(
        AppErrorKind.Network,
        'Friendminton took too long to respond. Please try again.',
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    sourceSignal?.removeEventListener('abort', abortFromSource);
  }
};

generatedClient.setConfig({
  baseUrl: apiBaseUrl,
  fetch: fetchWithTimeout,
});
configureSessionAuthentication();
configureDevelopmentLogging();

export function setApiSessionToken(token: string | null) {
  sessionToken = token;
}

export function authHeaders(_legacyUserId?: string): Record<string, string> {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
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

function configureSessionAuthentication() {
  generatedClient.interceptors.request.use((request) => {
    if (!sessionToken || request.headers.has('Authorization')) return request;
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${sessionToken}`);
    return new Request(request, { headers });
  });
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
  const options = { code: String(error.code), status };
  switch (error.code) {
    case 'bad_request':
      return new AppError(AppErrorKind.Validation, message, options);
    case 'conflict':
      return new AppError(AppErrorKind.Conflict, message, options);
    case 'email_not_verified':
      return new AppError(AppErrorKind.Authorization, message, options);
    case 'unauthorized':
      return new AppError(AppErrorKind.Authentication, message, options);
    case 'not_found':
      return new AppError(AppErrorKind.NotFound, message, options);
    case 'internal_server_error':
      return new AppError(AppErrorKind.Server, message, options);
    case 'service_unavailable':
      return new AppError(AppErrorKind.ServiceUnavailable, message, options);
    case 'upstream_service_error':
      return new AppError(AppErrorKind.UpstreamService, message, options);
    default:
      return new AppError(errorKindForApiStatus(status), message, options);
  }
}

function errorKindForApiStatus(status?: number) {
  if (status === 401) return AppErrorKind.Authentication;
  if (status === 403) return AppErrorKind.Authorization;
  if (status === 404) return AppErrorKind.NotFound;
  if (status === 409) return AppErrorKind.Conflict;
  if (status === 502) return AppErrorKind.UpstreamService;
  if (status === 503) return AppErrorKind.ServiceUnavailable;
  if (status !== undefined && status >= 400 && status < 500) return AppErrorKind.Validation;
  if (status !== undefined && status >= 500) return AppErrorKind.Server;
  return AppErrorKind.Unknown;
}
