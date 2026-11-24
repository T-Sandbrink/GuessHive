import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { describe, expect, it } from 'vitest';
import { type ApiEnv, loadEnv } from '../env.js';
import { pinoParams, REQUEST_ID_HEADER } from './logger.module.js';
import { rememberRouteTemplate, routeTemplate } from './route-template.js';

const baseEnv = loadEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@localhost/db' });

function options(overrides: Partial<ApiEnv> = {}): Options {
  return pinoParams({ ...baseEnv, ...overrides }).pinoHttp as Options;
}

function request(route?: { path?: unknown }): IncomingMessage {
  return { route } as unknown as IncomingMessage;
}

type FakeResponse = ServerResponse & { headers: Record<string, string> };

function response(statusCode = 200): FakeResponse {
  const headers: Record<string, string> = {};
  return {
    statusCode,
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as unknown as FakeResponse;
}

describe('pinoParams', () => {
  it.each([
    ['test', 'silent'],
    ['development', 'info'],
    ['production', 'info'],
  ] as const)('defaults the level for NODE_ENV=%s to %s', (NODE_ENV, level) => {
    expect(options({ NODE_ENV, LOG_LEVEL: undefined }).level).toBe(level);
  });

  it('lets an explicit LOG_LEVEL win over the default', () => {
    expect(options({ NODE_ENV: 'test', LOG_LEVEL: 'debug' }).level).toBe('debug');
    expect(options({ NODE_ENV: 'production', LOG_LEVEL: 'silent' }).level).toBe('silent');
  });

  it('uses pino-pretty only in development', () => {
    expect(options({ NODE_ENV: 'development' }).transport).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true },
    });
    expect(options({ NODE_ENV: 'production' }).transport).toBeUndefined();
    expect(options({ NODE_ENV: 'test' }).transport).toBeUndefined();
  });

  it.each([
    [200, undefined, 'info'],
    [304, undefined, 'info'],
    [399, undefined, 'info'],
    [400, undefined, 'warn'],
    [404, undefined, 'warn'],
    [499, undefined, 'warn'],
    [500, undefined, 'error'],
    [503, undefined, 'error'],
    [200, new Error('aborted'), 'error'],
  ])('logs status %i (error: %s) at level %s', (status, error, level) => {
    expect(options().customLogLevel?.(request(), response(status), error)).toBe(level);
  });

  it('generates a fresh UUID per request and sets it as a response header', () => {
    const genReqId = options().genReqId;
    const req = { headers: { 'x-request-id': 'attacker-chosen' } } as unknown as IncomingMessage;
    const res1 = response();
    const res2 = response();
    const id1 = genReqId?.(req, res1);
    const id2 = genReqId?.(req, res2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id1).not.toBe(id2);
    expect(res1.headers[REQUEST_ID_HEADER]).toBe(id1);
    expect(res2.headers[REQUEST_ID_HEADER]).toBe(id2);
  });

  it('adds the route template to success and error log objects', () => {
    const opts = options();
    const req = request({ path: '/questions/:id' });
    rememberRouteTemplate(req);
    expect(opts.customSuccessObject?.(req, response(), { responseTime: 3 })).toEqual({
      responseTime: 3,
      route: '/questions/:id',
    });
    expect(opts.customErrorObject?.(request(), response(500), new Error('x'), { a: 1 })).toEqual({
      a: 1,
      route: 'unmatched',
    });
  });

  it('serializes only id and method of the request and the status of the response', () => {
    const serializers = options().serializers as Record<string, (value: unknown) => unknown>;
    expect(
      serializers['req']?.({
        id: 'abc',
        method: 'GET',
        url: '/q?token=secret',
        headers: { cookie: 'session=x' },
        remoteAddress: '203.0.113.7',
      }),
    ).toEqual({ id: 'abc', method: 'GET' });
    expect(
      serializers['res']?.({ statusCode: 201, headers: { 'set-cookie': 'session=x' } }),
    ).toEqual({ statusCode: 201 });
  });

  it('removes auth headers, cookies and the client address from logged objects', () => {
    expect(options().redact).toEqual({
      paths: expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.remoteAddress',
        'req.remotePort',
      ]) as unknown,
      remove: true,
    });
  });
});

describe('rememberRouteTemplate / routeTemplate', () => {
  it('stores a matched route template', () => {
    const req = request({ path: '/questions/:id' });
    rememberRouteTemplate(req);
    expect(routeTemplate(req)).toBe('/questions/:id');
  });

  it('returns "unmatched" when nothing was recorded', () => {
    expect(routeTemplate(request())).toBe('unmatched');
  });

  it.each([
    ['no route', undefined],
    ['a route without a path', {}],
    ['a non-string path', { path: /regex/ }],
    ['a wildcard path', { path: '*path' }],
    ['a named wildcard path', { path: '/{*path}' }],
  ])('ignores %s', (_label, route) => {
    const req = request(route);
    rememberRouteTemplate(req);
    expect(routeTemplate(req)).toBe('unmatched');
  });

  it('keeps an earlier template when a later call sees a wildcard route', () => {
    const req = request({ path: '/questions/:id' }) as IncomingMessage & {
      route: { path: string };
    };
    rememberRouteTemplate(req);
    req.route = { path: '*path' };
    rememberRouteTemplate(req);
    expect(routeTemplate(req)).toBe('/questions/:id');
  });

  it('never falls back to the raw URL', () => {
    const req = { url: '/reset/secret-token' } as unknown as IncomingMessage;
    rememberRouteTemplate(req);
    expect(routeTemplate(req)).toBe('unmatched');
  });
});
