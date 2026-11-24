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

/** Longest a request waits for the rate-limit check before it counts as unavailable. */
export const STORAGE_TIMEOUT_MS = 300;

/** Connection states in which a command cannot get through soon. */
const UNAVAILABLE_STATUSES = new Set(['reconnecting', 'close', 'end']);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RateLimitStorageUnavailableError('ETIMEDOUT'));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * `@nestjs/throttler` storage on the api's shared ioredis connection (owner decision
 * 2026-11-24: own Lua script, no extra package). It never makes a request wait long for Redis:
 * while Redis is reconnecting it fails at once, and a command that gets no answer within
 * STORAGE_TIMEOUT_MS fails too (a stalled Redis must not hang the whole api).
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
    // `wait`/`connecting`/`connect` (first lazy connect) go through, bounded by the timeout.
    if (UNAVAILABLE_STATUSES.has(this.redis.status)) {
      throw new RateLimitStorageUnavailableError(this.redis.status);
    }
    // The hash tag keeps both keys in one slot, should Redis ever run as a cluster.
    const base = `${RATE_LIMIT_KEY_PREFIX}:{${throttlerName}:${key}}`;
    let reply: unknown;
    try {
      reply = await withTimeout(
        this.redis.eval(
          RATE_LIMIT_SCRIPT,
          2,
          base,
          `${base}:block`,
          String(ttl),
          String(limit),
          String(blockDuration),
        ),
        STORAGE_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof RateLimitStorageUnavailableError) {
        throw error;
      }
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
