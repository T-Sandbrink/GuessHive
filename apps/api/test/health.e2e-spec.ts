import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { HEALTH_CHECK_TIMEOUT_MS } from '../src/health/health.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

type Probe = () => Promise<unknown>;

async function createApp(db: Probe, redis: Probe): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      onModuleInit: () => undefined,
      onApplicationShutdown: () => undefined,
      $queryRaw: db,
    })
    .overrideProvider(RedisService)
    .useValue({ onApplicationShutdown: () => undefined, ping: redis })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

const up: Probe = () => Promise.resolve('PONG');
const down: Probe = () =>
  Promise.reject(new Error('connect ECONNREFUSED 10.1.2.3:6379 password=hunter2'));

describe('GET /health (task 1.7)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  it('returns 200 when the database and Redis answer', async () => {
    app = await createApp(up, up);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each([
    ['database', down, up, { database: 'down', redis: 'up' }],
    ['redis', up, down, { database: 'up', redis: 'down' }],
    ['both', down, down, { database: 'down', redis: 'down' }],
  ] as const)(
    'returns 503 when %s is down, without error details',
    async (_, db, redis, expected) => {
      app = await createApp(db, redis);
      const res = await request(app.getHttpServer()).get('/health').expect(503);
      expect(res.body).toEqual({ status: 'error', ...expected });
      expect(res.text).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|hunter2/);
      expect(res.headers['cache-control']).toBe('no-store');
    },
  );

  it('starts with Redis unreachable and reports it down within the budget', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: () => undefined,
        onApplicationShutdown: () => undefined,
        $queryRaw: up,
      })
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
    const started = Date.now();
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(Date.now() - started).toBeLessThan(HEALTH_CHECK_TIMEOUT_MS + 500);
    expect(res.body).toEqual({ status: 'error', database: 'up', redis: 'down' });
  });
});
