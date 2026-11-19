import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ApiErrorBody, ApiErrorCode } from '@guesshive/shared';
import { rememberRouteTemplate } from '../logging/logger.module.js';
import { ApiException } from './api.exception.js';

/** Generic code for an HttpException that carries no code of its own. */
const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Fixed messages for errors that are not ApiExceptions, so no internal detail leaks out. */
const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'Bad request',
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  METHOD_NOT_ALLOWED: 'Method not allowed',
  CONFLICT: 'Conflict',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  RATE_LIMITED: 'Too many requests',
  INTERNAL_ERROR: 'Internal server error',
  SERVICE_UNAVAILABLE: 'Service unavailable',
};

/** Maps any thrown value to a status and the `{ code, message }` body (AGENTS.md §7). */
export function toErrorResponse(exception: unknown): { status: number; body: ApiErrorBody } {
  if (exception instanceof ApiException) {
    const response = exception.getResponse() as ApiErrorBody;
    return {
      status: exception.getStatus(),
      body: { code: response.code, message: response.message },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    return { status, body: { code, message: MESSAGE_BY_CODE[code] } };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: 'INTERNAL_ERROR', message: MESSAGE_BY_CODE.INTERNAL_ERROR },
  };
}

/** Catch-all filter: every error response has the same `{ code, message }` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) {
      // Unexpected errors keep their stack in the server log, never in the response.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    const http = host.switchToHttp();
    // Errors from guards skip interceptors; record the route here too.
    rememberRouteTemplate(http.getRequest());
    this.adapterHost.httpAdapter.reply(http.getResponse(), body, status);
  }
}
