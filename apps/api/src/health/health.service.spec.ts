import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { HEALTH_CACHE_MS, HEALTH_CHECK_TIMEOUT_MS, HealthService } from './health.service.js';

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

  it('shares one probe run between concurrent callers and reuses it briefly', async () => {
    vi.useFakeTimers();
    const db = vi.fn(() => Promise.resolve(1));
    const ping = vi.fn(() => Promise.resolve('PONG'));
    const health = service(db, ping);

    const reports = await Promise.all(Array.from({ length: 20 }, () => health.check()));
    expect(new Set(reports.map((r) => r.status))).toEqual(new Set(['ok']));
    expect(db).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);

    await health.check();
    expect(db).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HEALTH_CACHE_MS);
    await health.check();
    expect(db).toHaveBeenCalledTimes(2);
    expect(ping).toHaveBeenCalledTimes(2);
  });
});
