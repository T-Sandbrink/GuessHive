import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule as PinoLoggerModule, type Params } from 'nestjs-pino';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { RouteTemplateInterceptor } from './route-template.interceptor.js';
import { routeTemplate } from './route-template.js';

/** Response header that carries the request id, so a user-reported error can be found in the logs. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * pino-http options. Logs only request id, method, route template, status and response
 * time: no IP addresses, headers, cookies, query strings or bodies (AGENTS.md §8, §9).
 */
export function pinoParams(env: ApiEnv): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
      // Always generate our own id; an incoming X-Request-Id is client input and not trusted.
      genReqId: (_req: IncomingMessage, res: ServerResponse) => {
        const id = randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      // Added when the response is logged, after the Nest handler recorded its route.
      // (customProps would also run at request start and log the key twice.)
      customSuccessObject: (req, _res, value: object) => ({ ...value, route: routeTemplate(req) }),
      customErrorObject: (req, _res, _error, value: object) => ({
        ...value,
        route: routeTemplate(req),
      }),
      customLogLevel: (_req, res, error) => {
        if (error !== undefined || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        // Serialized when the request starts, before routing; customSuccessObject and
        // customErrorObject add the route at response end.
        req: (req: { id: unknown; method: unknown }) => ({ id: req.id, method: req.method }),
        res: (res: { statusCode: unknown }) => ({ statusCode: res.statusCode }),
      },
      // Defence in depth in case a log call passes a raw request or response object.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-turnstile-token"]',
          'res.headers["set-cookie"]',
          'req.remoteAddress',
          'req.remotePort',
        ],
        remove: true,
      },
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}

/** Structured request logging (pino). Registered once, in AppModule. */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => pinoParams(env),
    }),
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RouteTemplateInterceptor }],
})
export class LoggerModule {}
