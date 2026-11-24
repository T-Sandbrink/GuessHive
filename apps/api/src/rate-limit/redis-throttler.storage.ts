import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { redisErrorCode } from '../redis/redis-errors.js';
import { RedisService } from '../redis/redis.service.js';
import { RATE_LIMIT_KEY_PREFIX } from './rate-limit.constants.js';

/** Seconds, as the throttler expects them in headers (`Retry-After`, `X-RateLimit-Reset`). */
interface StorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Fixed window with a block, atomic in one round trip. KEYS: hits key, block key.
 * ARGV: window ms, limit, block ms. Returns hits, window ms left, blocked (0/1), block ms left.
 */
export const RATE_LIMIT_SCRIPT = `
local blockLeft = redis.call('PTTL', KEYS[2])
if blockLeft > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or ARGV[2])
  return { hits, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockLeft }
end
local hits = redis.call('INCR', KEYS[1])
local left = redis.call('PTTL', KEYS[1])
if left < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  left = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, left, 1, tonumber(ARGV[3]) }
end
return { hits, left, 0, 0 }
`;

/** Thrown when Redis cannot answer; the guard then lets the request through or refuses it. */
export class RateLimitStorageUnavailableError extends Error {
  constructor(readonly code: string) {
    super('Rate-limit storage unavailable');
    this.name = 'RateLimitStorageUnavailableError';
  }
}

const toSeconds = (ms: number): number => Math.ceil(ms / 1000);

/**
 * `@nestjs/throttler` storage on the api's shared ioredis connection (owner decision
 * 2026-11-24: own Lua script, no extra package). While Redis is reconnecting it fails at once
 * instead of making every request wait for the reconnect.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    // `wait` = never connected yet (lazyConnect): the command below opens the connection.
    if (this.redis.status !== 'ready' && this.redis.status !== 'wait') {
      throw new RateLimitStorageUnavailableError(this.redis.status);
    }
    const base = `${RATE_LIMIT_KEY_PREFIX}:${throttlerName}:${key}`;
    let reply: unknown;
    try {
      reply = await this.redis.eval(
        RATE_LIMIT_SCRIPT,
        2,
        base,
        `${base}:block`,
        String(ttl),
        String(limit),
        String(blockDuration),
      );
    } catch (error) {
      throw new RateLimitStorageUnavailableError(
        error instanceof Error ? redisErrorCode(error) : 'unknown',
      );
    }
    if (!Array.isArray(reply) || reply.length !== 4 || !reply.every(Number.isInteger)) {
      throw new RateLimitStorageUnavailableError('BAD_REPLY');
    }
    const [totalHits, windowLeftMs, blocked, blockLeftMs] = reply as number[];
    return {
      totalHits: totalHits ?? 0,
      timeToExpire: toSeconds(windowLeftMs ?? 0),
      isBlocked: blocked === 1,
      timeToBlockExpire: toSeconds(blockLeftMs ?? 0),
    };
  }
}
