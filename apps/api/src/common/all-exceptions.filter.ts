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
import { rememberRouteTemplate } from '../logging/route-template.js';
import { ApiException } from './api.exception.js';
import { ValidationFailedException } from './validation.js';

/** Codes the filter itself produces for errors that are not ApiExceptions. */
type GenericErrorCode = Extract<
  ApiErrorCode,
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
>;

/** Generic code for an HttpException that carries no code of its own. */
const CODE_BY_STATUS: Partial<Record<number, GenericErrorCode>> = {
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
const MESSAGE_BY_CODE: Record<GenericErrorCode, string> = {
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

const INTERNAL_ERROR_RESPONSE = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  body: { code: 'INTERNAL_ERROR', message: MESSAGE_BY_CODE.INTERNAL_ERROR },
} as const satisfies { status: number; body: ApiErrorBody };

/** Only 4xx and 5xx are error statuses; anything else thrown as an error is a bug. */
function isErrorStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

/**
 * Maps any thrown value to a status and the `{ code, message }` body (AGENTS.md §7), plus
 * `issues` for request validation failures (ADR 0003).
 */
export function toErrorResponse(exception: unknown): { status: number; body: ApiErrorBody } {
  if (exception instanceof HttpException && !isErrorStatus(exception.getStatus())) {
    return INTERNAL_ERROR_RESPONSE;
  }
  if (exception instanceof ValidationFailedException) {
    return {
      status: exception.getStatus(),
      body: {
        code: 'VALIDATION_FAILED',
        message: MESSAGE_BY_CODE.VALIDATION_FAILED,
        issues: exception.issues,
      },
    };
  }
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
  return INTERNAL_ERROR_RESPONSE;
}

/**
 * What the server log keeps of an unexpected error: its type, a driver/Prisma error code and
 * the stack frames, but never the message. Messages can quote user input or personal data
 * (e.g. Prisma validation errors, pg "invalid input syntax" errors), AGENTS.md §8.
 */
export function describeError(exception: unknown): Record<string, unknown> {
  if (!(exception instanceof Error)) {
    return { errType: typeof exception };
  }
  const code = (exception as { code?: unknown }).code;
  // Drop the "Name: message" header first: a multi-line message could contain a line that
  // looks like a frame ("    at jan@example.com").
  const stack = exception.stack ?? '';
  const header = String(exception);
  const frames = (stack.startsWith(header) ? stack.slice(header.length) : '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
  return {
    errType: exception.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { errCode: code } : {}),
    ...(exception instanceof HttpException ? { status: exception.getStatus() } : {}),
    frames,
  };
}

/** Catch-all filter: every HTTP error response has the same `{ code, message }` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      // Other transports (ws, queues) get their own handling; never reply as HTTP there.
      throw exception;
    }
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) {
      this.logger.error(describeError(exception), 'Unhandled error');
    }
    const http = host.switchToHttp();
    // Errors from guards skip interceptors; record the route here too.
    rememberRouteTemplate(http.getRequest());
    const { httpAdapter } = this.adapterHost;
    const response: unknown = http.getResponse();
    if (httpAdapter.isHeadersSent(response)) {
      // The response already started; all we can do is end it.
      httpAdapter.end(response);
      return;
    }
    httpAdapter.reply(response, body, status);
  }
}
