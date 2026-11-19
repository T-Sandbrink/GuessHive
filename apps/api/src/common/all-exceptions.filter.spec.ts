import type { IncomingMessage } from 'node:http';
import {
  type ArgumentsHost,
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  MethodNotAllowedException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { API_ERROR_CODES } from '@guesshive/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTemplate } from '../logging/route-template.js';
import { AllExceptionsFilter, describeError, toErrorResponse } from './all-exceptions.filter.js';
import { ApiException } from './api.exception.js';

describe('toErrorResponse', () => {
  const mapped: [string, HttpException, number, string, string][] = [
    ['BadRequestException', new BadRequestException('detail'), 400, 'BAD_REQUEST', 'Bad request'],
    ['UnauthorizedException', new UnauthorizedException('d'), 401, 'UNAUTHORIZED', 'Unauthorized'],
    ['ForbiddenException', new ForbiddenException('detail'), 403, 'FORBIDDEN', 'Forbidden'],
    ['NotFoundException', new NotFoundException('detail'), 404, 'NOT_FOUND', 'Not found'],
    [
      'MethodNotAllowedException',
      new MethodNotAllowedException('detail'),
      405,
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
    ],
    ['ConflictException', new ConflictException('detail'), 409, 'CONFLICT', 'Conflict'],
    [
      'PayloadTooLargeException',
      new PayloadTooLargeException('detail'),
      413,
      'PAYLOAD_TOO_LARGE',
      'Payload too large',
    ],
    [
      'UnsupportedMediaTypeException',
      new UnsupportedMediaTypeException('detail'),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Unsupported media type',
    ],
    [
      'UnprocessableEntityException',
      new UnprocessableEntityException('detail'),
      422,
      'VALIDATION_FAILED',
      'Validation failed',
    ],
    [
      'HttpException(429)',
      new HttpException('detail', HttpStatus.TOO_MANY_REQUESTS),
      429,
      'RATE_LIMITED',
      'Too many requests',
    ],
    [
      'ServiceUnavailableException',
      new ServiceUnavailableException('detail'),
      503,
      'SERVICE_UNAVAILABLE',
      'Service unavailable',
    ],
  ];

  it.each(mapped)(
    'maps %s to %i %s with a fixed message',
    (_label, exception, status, code, message) => {
      expect(toErrorResponse(exception)).toEqual({ status, body: { code, message } });
    },
  );

  it('maps unmapped 4xx HttpExceptions to BAD_REQUEST and keeps the status', () => {
    expect(toErrorResponse(new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT))).toEqual({
      status: 418,
      body: { code: 'BAD_REQUEST', message: 'Bad request' },
    });
  });

  it('maps unmapped 5xx HttpExceptions to INTERNAL_ERROR and keeps the status', () => {
    expect(toErrorResponse(new BadGatewayException('upstream secret'))).toEqual({
      status: 502,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('never leaks the message or response object of a plain HttpException', () => {
    const exception = new HttpException(
      { code: 'VOTE_ALREADY_CAST', message: 'user jan@example.com' },
      HttpStatus.CONFLICT,
    );
    expect(toErrorResponse(exception).body).toEqual({ code: 'CONFLICT', message: 'Conflict' });
  });

  it('passes ApiException code, message and status through', () => {
    expect(
      toErrorResponse(new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Slow down')),
    ).toEqual({ status: 429, body: { code: 'RATE_LIMITED', message: 'Slow down' } });
  });

  it.each([
    ['an Error', new Error('db password hunter2')],
    ['a TypeError', new TypeError('x is undefined')],
    ['a string', 'boom'],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['a look-alike plain object', { status: 400, code: 'BAD_REQUEST', message: 'fake' }],
  ])('maps %s to 500 INTERNAL_ERROR', (_label, exception) => {
    expect(toErrorResponse(exception)).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('only returns known codes with a non-empty message for every 4xx and 5xx status', () => {
    for (let status = 400; status < 600; status++) {
      const { body } = toErrorResponse(new HttpException('x', status));
      expect(API_ERROR_CODES).toContain(body.code);
      expect(body.message).not.toBe('');
    }
  });
});

describe('describeError', () => {
  it('keeps type, code and stack frames but never the message', () => {
    const error = Object.assign(new Error('invalid input for jan@example.com'), { code: 'P2002' });
    const described = describeError(error);
    expect(described).toMatchObject({ errType: 'Error', errCode: 'P2002' });
    expect(described['frames']).toEqual(expect.arrayContaining([expect.stringMatching(/^at /)]));
    expect(JSON.stringify(described)).not.toContain('jan@example.com');
  });

  it('never treats lines of a multi-line message as stack frames', () => {
    const described = describeError(new Error('bad input\n    at jan@example.com'));
    expect(JSON.stringify(described)).not.toContain('jan@example.com');
  });

  it('describes non-Error throwables by type only', () => {
    expect(describeError('secret string')).toEqual({ errType: 'string' });
    expect(describeError({ password: 'x' })).toEqual({ errType: 'object' });
  });
});

describe('toErrorResponse with non-error statuses', () => {
  it.each([200, 302, 450.5, 600])('maps an HttpException with status %i to 500', (status) => {
    expect(toErrorResponse(new HttpException('x', status))).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('maps an ApiException with a 2xx status to 500', () => {
    expect(toErrorResponse(new ApiException(HttpStatus.OK, 'CONFLICT', 'x')).status).toBe(500);
  });
});

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup(
    route?: { path?: unknown },
    options: { type?: string; headersSent?: boolean } = {},
  ) {
    const reply = vi.fn();
    const end = vi.fn();
    const isHeadersSent = vi.fn(() => options.headersSent ?? false);
    const adapterHost = {
      httpAdapter: { reply, end, isHeadersSent },
    } as unknown as HttpAdapterHost;
    const req = { route } as unknown as IncomingMessage;
    const res = {};
    const host = {
      getType: () => options.type ?? 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ArgumentsHost;
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    return { filter: new AllExceptionsFilter(adapterHost), reply, end, req, res, host, logError };
  }

  it('replies with the mapped status and body', () => {
    const { filter, reply, res, host } = setup();
    filter.catch(new ForbiddenException('nope'), host);
    expect(reply).toHaveBeenCalledWith(res, { code: 'FORBIDDEN', message: 'Forbidden' }, 403);
  });

  it('does not log 4xx errors', () => {
    const { filter, host, logError } = setup();
    filter.catch(new NotFoundException(), host);
    filter.catch(new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'dup'), host);
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs unexpected errors without their message', () => {
    const { filter, host, logError } = setup();
    filter.catch(new Error('database password is hunter2'), host);
    expect(logError).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ errType: 'Error' }),
      'Unhandled error',
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain('hunter2');
  });

  it('logs 5xx HttpExceptions too', () => {
    const { filter, host, logError } = setup();
    filter.catch(new ServiceUnavailableException(), host);
    expect(logError).toHaveBeenCalledOnce();
  });

  it('answers non-Error throwables with INTERNAL_ERROR', () => {
    const { filter, host, logError, reply, res } = setup();
    filter.catch('plain string', host);
    expect(logError).toHaveBeenCalledWith({ errType: 'string' }, 'Unhandled error');
    expect(reply).toHaveBeenCalledWith(
      res,
      { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      500,
    );
  });

  it('records the matched route template for the log line', () => {
    const { filter, host, req } = setup({ path: '/questions/:id' });
    filter.catch(new ForbiddenException(), host);
    expect(routeTemplate(req)).toBe('/questions/:id');
  });

  it('only ends the response when headers were already sent', () => {
    const { filter, host, reply, end, res } = setup(undefined, { headersSent: true });
    filter.catch(new Error('late'), host);
    expect(reply).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledWith(res);
  });

  it('rethrows in non-HTTP contexts instead of replying', () => {
    const { filter, host, reply } = setup(undefined, { type: 'rpc' });
    const error = new Error('job failed');
    expect(() => {
      filter.catch(error, host);
    }).toThrow(error);
    expect(reply).not.toHaveBeenCalled();
  });
});
