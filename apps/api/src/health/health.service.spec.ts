import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { HEALTH_CHECK_TIMEOUT_MS, HealthService } from './health.service.js';

function service(db: () => Promise<unknown>, ping: () => Promise<unknown>): HealthService {
  return new HealthService(
    { $queryRaw: db } as unknown as PrismaService,
    { ping } as unknown as RedisService,
  );
}

describe('HealthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a hanging dependency as down after the timeout', async () => {
    vi.useFakeTimers();
    const result = service(
      () => new Promise(() => undefined),
      () => Promise.resolve('PONG'),
    ).check();
    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ status: 'error', database: 'down', redis: 'up' });
  });

  it('checks both dependencies in parallel', async () => {
    vi.useFakeTimers();
    const slow = () =>
      new Promise((resolve) => {
        setTimeout(resolve, HEALTH_CHECK_TIMEOUT_MS - 100);
      });
    const result = service(slow, slow).check();
    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS - 100);
    await expect(result).resolves.toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });
});
