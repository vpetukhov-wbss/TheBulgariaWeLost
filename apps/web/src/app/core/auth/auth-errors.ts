import { HttpErrorResponse } from '@angular/common/http';

type ProblemBody = {
  code?: unknown;
  message?: unknown;
};

export function problemCode(error: unknown): string | undefined {
  if (!(error instanceof HttpErrorResponse)) return undefined;
  const body: unknown = error.error;
  if (!body || typeof body !== 'object') return undefined;
  const code = (body as ProblemBody).code;
  return typeof code === 'string' ? code : undefined;
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

export function isServiceUnavailable(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}

export function actionError(error: unknown, fallback: string): string {
  return isServiceUnavailable(error)
    ? 'Услугата е временно недостъпна. Опитай отново след малко.'
    : fallback;
}
