import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type CanActivate,
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  Injectable,
  Module,
  Param,
  UseGuards,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { type App } from 'supertest/types.js';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter.js';
import { loadEnv } from '../src/env.js';
import { pinoParams } from '../src/logging/logger.module.js';
import { RouteTemplateInterceptor } from '../src/logging/route-template.interceptor.js';

@Injectable()
class DenyGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException('user jan@example.com may not see group secret-group');
  }
}

@Controller('questions')
class QuestionsController {
  @Get(':id')
  get(@Param('id') id: string): { id: string } {
    return { id };
  }

  @Get(':id/private')
  @UseGuards(DenyGuard)
  private(@Param('id') id: string): { id: string } {
    return { id };
  }

  @Get(':id/crash')
  crash(): never {
    throw new Error('database password is hunter2');
  }
}

/** Collects every log line pino writes. */
function memoryStream(lines: string[]): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(...chunk.toString('utf8').trim().split('\n'));
      done();
    },
  });
}

describe('request logging', () => {
  let app: INestApplication<App>;
  const lines: string[] = [];

  beforeEach(async () => {
    lines.length = 0;
    const { pinoHttp } = pinoParams({
      ...loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://u:p@localhost/db' }),
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    });

    @Module({
      imports: [PinoLoggerModule.forRoot({ pinoHttp: [pinoHttp as object, memoryStream(lines)] })],
      controllers: [QuestionsController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RouteTemplateInterceptor },
      ],
    })
    class LoggingTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [LoggingTestModule] }).compile();
    app = moduleRef.createNestApplication();
    // Route Nest's own Logger (used by the exception filter) to the same pino stream.
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('logs the route template, never the raw URL, query, IP or headers', async () => {
    await request(app.getHttpServer())
      .get('/questions/k3x9?token=secret-token&email=jan@example.com')
      .set('Cookie', 'session=secret-cookie')
      .set('Authorization', 'Bearer secret-bearer')
      .expect(200);

    const entry = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((log) => log['res'] !== undefined);
    expect(entry).toBeDefined();
    expect(entry?.['req']).toEqual({ id: expect.any(String) as unknown, method: 'GET' });
    expect(entry?.['route']).toBe('/questions/:id');
    expect(entry?.['res']).toEqual({ statusCode: 200 });
    expect(entry?.['responseTime']).toEqual(expect.any(Number));

    const all = lines.join('\n');
    expect(all.match(/"route":/g)).toHaveLength(1);
    for (const secret of [
      'k3x9',
      'secret-token',
      'jan@example.com',
      'secret-cookie',
      'secret-bearer',
      '127.0.0.1',
      '::1',
    ]) {
      expect(all).not.toContain(secret);
    }
  });

  it('logs the route template when a guard rejects the request', async () => {
    const res = await request(app.getHttpServer())
      .get('/questions/k3x9/private?token=secret-token')
      .expect(403);
    expect(res.body).toEqual({ code: 'FORBIDDEN', message: 'Forbidden' });

    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const entry = entries.find((log) => log['res'] !== undefined);
    expect(entry?.['route']).toBe('/questions/:id/private');
    expect(entry?.['res']).toEqual({ statusCode: 403 });
    expect(entry?.['level']).toBe(40);

    const all = lines.join('\n');
    expect(all.match(/"route":/g)).toHaveLength(1);
    for (const secret of ['k3x9', 'secret-token', 'jan@example.com', 'secret-group']) {
      expect(all).not.toContain(secret);
    }
  });

  it('logs 5xx responses at error level without the error message anywhere', async () => {
    const res = await request(app.getHttpServer()).get('/questions/boom/crash').expect(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });

    const entry = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((log) => log['res'] !== undefined);
    expect(entry?.['route']).toBe('/questions/:id/crash');
    expect(entry?.['level']).toBe(50);

    const all = lines.join('\n');
    expect(all).toContain('Unhandled error');
    expect(all).not.toContain('hunter2');
  });

  it('logs unmatched routes without their path', async () => {
    await request(app.getHttpServer()).get('/reset-password/secret-reset-token').expect(404);

    const all = lines.join('\n');
    expect(all.match(/"route":/g)).toHaveLength(1);
    expect(all).toContain('"route":"unmatched"');
    expect(all).not.toContain('secret-reset-token');
  });
});
