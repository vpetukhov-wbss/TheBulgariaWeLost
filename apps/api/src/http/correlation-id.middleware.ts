import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { CorrelatedRequest } from '../utils/types/request-with-user.type';

export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

const correlationIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function correlationIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const provided = request.header(CORRELATION_ID_HEADER);
  const correlationId =
    provided && correlationIdPattern.test(provided) ? provided : randomUUID();

  (request as CorrelatedRequest).correlationId = correlationId;
  response.setHeader(CORRELATION_ID_HEADER, correlationId);
  next();
}
