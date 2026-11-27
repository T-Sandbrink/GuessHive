import { Controller, Get, type INestApplication, Logger } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import { type App } from 'supertest/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../common/all-exceptions.filter.js';
import { ConfigModule } from '../config/config.module.js';
import { RedisService } from '../redis/redis.service.js';
import { hashIp } from './ip-hash.js';
import { RateLimit } from './rate-limit.decorator.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimitModule } from './rate-limit.module.js';
import {
  RateLimitStorageUnavailableError,
  RedisThrottlerStorage,
  STORAGE_TIMEOUT_MS,
} from './redis-throttler.storage.js';

const SECRET = 'unit-test-secret-of-at-least-32-characters';

describe('hashIp', () => {
  it('is a keyed hash that never contains the IP', () => {
    const hash = hashIp(SECRET, '203.0.113.7');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIp(SECRET, '203.0.113.7'));
    expect(hash).not.toBe(hashIp(`${SECRET}x`, '203.0.113.7'));
    expect(hash).not.toBe(hashIp(SECRET, '203.0.113.8'));
  });

  it('treats a whole IPv6 /64 as one client', () => {
    expect(hashIp(SECRET, '2001:db8:1:2::1')).toBe(hashIp(SECRET, '2001:db8:1:2:ffff::9'));
    expect(hashIp(SECRET, '2001:db8:1:2::1')).not.toBe(hashIp(SECRET, '2001:db8:1:3::1'));
  });
});

describe('@RateLimit', () => {
  it('rejects invalid options when the class is defined', () => {
    expect(() => RateLimit({ limit: 0, ttlMs: 1_000 })).toThrow();
    expect(() => RateLimit({ limit: 5, ttlMs: 1.5 })).toThrow();
  });
});

describe('RedisThrottlerStorage', () => {
  function storageWith(redis: Partial<RedisService>): RedisThrottlerStorage {
    return new RedisThrottlerStorage(redis as RedisService);
  }

  it('fails at once while Redis is reconnecting, without sending a command', async () => {
    const evalFn = vi.fn();
    const storage = storageWith({ status: 'reconnecting', eval: evalFn } as never);
    await expect(storage.increment('k', 1_000, 5, 1_000, 'global')).rejects.toBeInstanceOf(
      RateLimitStorageUnavailableError,
    );
    expect(evalFn).not.toHaveBeenCalled();
  });

  it('fails with ETIMEDOUT when Redis does not answer in time', async () => {
    vi.useFakeTimers();
    try {
      const storage = storageWith({
        status: 'ready',
        eval: vi.fn(() => new Promise(() => undefined)),
      } as never);
      const pending = storage.increment('k', 1_000, 5, 1_000, 'global');
      const assertion = expect(pending).rejects.toMatchObject({ code: 'ETIMEDOUT' });
      await vi.advanceTimersByTimeAsync(STORAGE_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the first lazy connect through', async () => {
    const evalFn = vi.fn().mockResolvedValue([1, 1_000, 0, 0]);
    await storageWith({ status: 'connecting', eval: evalFn } as never).increment(
      'k',
      1_000,
      5,
      1_000,
      'global',
    );
    expect(evalFn).toHaveBeenCalledOnce();
  });

  it('converts the script reply to seconds', async () => {
    const storage = storageWith({
      status: 'ready',
      eval: vi.fn().mockResolvedValue([3, 59_001, 0, 0]),
    } as never);
    await expect(storage.increment('k', 60_000, 5, 60_000, 'global')).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('turns command errors and odd replies into an unavailable error with a code only', async () => {
    const failing = storageWith({
      status: 'ready',
      eval: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('host 10.0.0.5'), { code: 'NOAUTH' })),
    } as never);
    await expect(failing.increment('k', 1, 1, 1, 'global')).rejects.toMatchObject({
      code: 'NOAUTH',
      message: 'Rate-limit storage unavailable',
    });
    const odd = storageWith({ status: 'ready', eval: vi.fn().mockResolvedValue('OK') } as never);
    await expect(odd.increment('k', 1, 1, 1, 'global')).rejects.toMatchObject({
      code: 'BAD_REPLY',
    });
  });
});

@Controller('rl')
class RateLimitedController {
  @Get('open')
  open(): string {
    return 'ok';
  }

  @Get('login')
  @RateLimit({ limit: 2, ttlMs: 60_000, failClosed: true })
  login(): string {
    return 'ok';
  }
}

/** In-memory stand-in for Redis: counts per key, or fails every call when `down`. */
class FakeStorage {
  down = false;
  readonly keys: string[] = [];
  readonly hits = new Map<string, number>();

  increment(key: string, _ttl: number, limit: number, _block: number, name: string) {
    if (this.down) {
      return Promise.reject(new RateLimitStorageUnavailableError('ECONNREFUSED'));
    }
    const full = `${name}:${key}`;
    this.keys.push(full);
    const hits = (this.hits.get(full) ?? 0) + 1;
    this.hits.set(full, hits);
    const isBlocked = hits > limit;
    return Promise.resolve({
      totalHits: hits,
      timeToExpire: 60,
      isBlocked,
      timeToBlockExpire: isBlocked ? 60 : 0,
    });
  }
}

describe('RateLimitGuard (task 1.9)', () => {
  let app: INestApplication<App> | undefined;
  const storage = new FakeStorage();

  async function createApp(): Promise<INestApplication<App>> {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
    vi.stubEnv('IP_HASH_SECRET', SECRET);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, RateLimitModule],
      controllers: [RateLimitedController],
      providers: [
        { provide: RedisService, useValue: {} },
        // AppModule registers the guard globally (task 2.8); RateLimitModule only provides storage.
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    })
      .overrideProvider(getStorageToken())
      .useValue(storage)
      .overrideProvider(RedisThrottlerStorage)
      .useValue(storage)
      .compile();
    const created = moduleRef.createNestApplication<INestApplication<App>>();
    // Stand-in for the auth session (phase 2): `x-test-user` puts a user on the request.
    created.use(
      (
        req: { headers: Record<string, unknown>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const id = req.headers['x-test-user'];
        if (typeof id === 'string') {
          req.user = { id };
        }
        next();
      },
    );
    await created.init();
    return created;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
    storage.down = false;
    storage.keys.length = 0;
    storage.hits.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('counts guests by IP hash on one global key, and adds the route limit', async () => {
    app = await createApp();
    await request(app.getHttpServer()).get('/rl/open').expect(200);
    await request(app.getHttpServer()).get('/rl/login').expect(200);
    const globalKeys = new Set(storage.keys.filter((key) => key.startsWith('global:')));
    expect(globalKeys.size).toBe(1);
    expect([...globalKeys][0]).toMatch(/^global:ip:[0-9a-f]{64}$/);
    expect(storage.keys.filter((key) => key.startsWith('route:'))).toHaveLength(1);
    expect(storage.keys.join()).not.toMatch(/127\.0\.0\.1|::1/);
  });

  it('counts signed-in users by user id', async () => {
    app = await createApp();
    await request(app.getHttpServer()).get('/rl/open').set('x-test-user', 'u-1').expect(200);
    expect(storage.keys).toEqual(['global:user:u-1']);
  });

  it('answers 429 RATE_LIMITED with Retry-After over the route limit', async () => {
    app = await createApp();
    const server = app.getHttpServer();
    await request(server).get('/rl/login').expect(200);
    await request(server).get('/rl/login').expect(200);
    const res = await request(server).get('/rl/login').expect(429);
    expect(res.body).toEqual({ code: 'RATE_LIMITED', message: 'Too many requests' });
    expect(res.headers['retry-after-route']).toBe('60');
    expect(res.headers['retry-after']).toBe('60');
  });

  it('lets requests through when Redis is down, and logs once', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    app = await createApp();
    storage.down = true;
    await request(app.getHttpServer()).get('/rl/open').expect(200);
    await request(app.getHttpServer()).get('/rl/open').expect(200);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      'Rate-limit storage unavailable (ECONNREFUSED); allowing requests',
    );
  });

  it('refuses fail-closed routes with 503 when Redis is down', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    app = await createApp();
    storage.down = true;
    const res = await request(app.getHttpServer()).get('/rl/login').expect(503);
    expect(res.body).toEqual({ code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' });
  });
});
