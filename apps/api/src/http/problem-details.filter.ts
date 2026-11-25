import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { CorrelatedRequest } from '../utils/types/request-with-user.type';

interface ExceptionPayload {
  code?: unknown;
  error?: unknown;
  message?: unknown;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = this.payload(exception);
    const code =
      typeof payload.code === 'string'
        ? payload.code
        : status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'internal_error'
          : `http_${status}`;
    const title =
      typeof payload.error === 'string'
        ? payload.error
        : ((HttpStatus[status] as string | undefined)?.replaceAll('_', ' ') ??
          'Request failed');
    const messages = Array.isArray(payload.message)
      ? payload.message.filter(
          (message): message is string => typeof message === 'string',
        )
      : typeof payload.message === 'string'
        ? [payload.message]
        : [];

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://thebulgariawelost.org/problems/${code}`,
        title,
        status,
        detail:
          status === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'An unexpected error occurred.'
            : messages[0],
        instance: request.originalUrl.split('?')[0],
        code,
        traceId: request.correlationId,
        ...(messages.length > 1 ? { errors: messages } : {}),
      });
  }

  private payload(exception: unknown): ExceptionPayload {
    if (!(exception instanceof HttpException)) return {};
    const response = exception.getResponse();
    return typeof response === 'string'
      ? { message: response }
      : (response as ExceptionPayload);
  }
}
