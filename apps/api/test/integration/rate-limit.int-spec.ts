import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMIT_KEY_PREFIX } from '../../src/rate-limit/rate-limit.constants.js';
import { RedisThrottlerStorage } from '../../src/rate-limit/redis-throttler.storage.js';
import type { RedisService } from '../../src/redis/redis.service.js';
import { testRedisUrl } from './test-db-url.js';

// The Lua script against the docker compose Redis (db 15, guarded by testRedisUrl), task 1.9.
describe('RedisThrottlerStorage against real Redis (task 1.9)', () => {
  let redis: Redis;
  let storage: RedisThrottlerStorage;

  beforeAll(async () => {
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    storage = new RedisThrottlerStorage(redis as unknown as RedisService);
  });

  beforeEach(async () => {
    const keys = await redis.keys(`${RATE_LIMIT_KEY_PREFIX}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('counts hits in a window that expires', async () => {
    const first = await storage.increment('client', 60_000, 3, 60_000, 'global');
    expect(first).toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    await storage.increment('client', 60_000, 3, 60_000, 'global');
    const third = await storage.increment('client', 60_000, 3, 60_000, 'global');
    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(false);
    const pttl = await redis.pttl(`${RATE_LIMIT_KEY_PREFIX}:global:client`);
    expect(pttl).toBeGreaterThan(0);
    expect(pttl).toBeLessThanOrEqual(60_000);
  });

  it('blocks over the limit for the block duration, without counting further', async () => {
    for (let i = 0; i < 2; i++) {
      await storage.increment('client', 60_000, 2, 30_000, 'route');
    }
    const over = await storage.increment('client', 60_000, 2, 30_000, 'route');
    expect(over).toMatchObject({ totalHits: 3, isBlocked: true, timeToBlockExpire: 30 });
    const again = await storage.increment('client', 60_000, 2, 30_000, 'route');
    expect(again).toMatchObject({ totalHits: 3, isBlocked: true });
  });

  it('starts a new window after expiry', async () => {
    await storage.increment('client', 50, 1, 50, 'global');
    await storage.increment('client', 50, 1, 50, 'global');
    await new Promise((resolve) => setTimeout(resolve, 120));
    await expect(storage.increment('client', 50, 1, 50, 'global')).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  it('keeps clients and throttlers apart', async () => {
    await storage.increment('a', 60_000, 5, 60_000, 'global');
    await expect(storage.increment('b', 60_000, 5, 60_000, 'global')).resolves.toMatchObject({
      totalHits: 1,
    });
    await expect(storage.increment('a', 60_000, 5, 60_000, 'route')).resolves.toMatchObject({
      totalHits: 1,
    });
  });
});
