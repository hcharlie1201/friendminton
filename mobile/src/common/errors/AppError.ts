export enum AppErrorKind {
  Authentication = 'authentication',
  Authorization = 'authorization',
  Conflict = 'conflict',
  EmptyResponse = 'empty_response',
  Network = 'network',
  NotFound = 'not_found',
  Server = 'server',
  ServiceUnavailable = 'service_unavailable',
  UpstreamService = 'upstream_service',
  Unknown = 'unknown',
  Upload = 'upload',
  Validation = 'validation',
}

type AppErrorOptions = {
  cause?: unknown;
  status?: number;
};

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly originalCause?: unknown;

  constructor(kind: AppErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.status = options.status;
    this.originalCause = options.cause;
  }
}

export function appErrorFromStatus(message: string, status?: number) {
  return new AppError(errorKindForStatus(status), message, { status });
}

export function normalizeAppError(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof AppError) return error;
  if (isNetworkError(error)) {
    return new AppError(
      AppErrorKind.Network,
      'Unable to reach Friendminton. Check your connection and try again.',
      { cause: error },
    );
  }
  if (error instanceof Error) {
    return new AppError(AppErrorKind.Unknown, error.message || fallback, { cause: error });
  }
  return new AppError(AppErrorKind.Unknown, fallback, { cause: error });
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  return normalizeAppError(error, fallback).message;
}

function errorKindForStatus(status?: number) {
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

function isNetworkError(error: unknown) {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLocaleLowerCase();
  return message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('load failed');
}
