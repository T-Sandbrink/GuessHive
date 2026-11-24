// Runs before every e2e test file: starts each file with fresh rate-limit counters (task 1.9).
import { Redis } from 'ioredis';
import { beforeAll } from 'vitest';
import { RATE_LIMIT_KEY_PREFIX } from '../src/rate-limit/rate-limit.constants.js';
import { testRedisUrl } from './integration/test-db-url.js';

beforeAll(async () => {
  const redis = new Redis(testRedisUrl(), {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  // Ignore errors: without Redis the api fails open and there are no counters to clear.
  redis.on('error', () => undefined);
  try {
    await redis.connect();
    const keys = await redis.keys(`${RATE_LIMIT_KEY_PREFIX}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Redis is not running.
  } finally {
    redis.disconnect();
  }
});
