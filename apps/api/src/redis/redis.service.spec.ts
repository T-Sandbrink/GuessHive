import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from './redis.service.js';

function create(): RedisService {
  return new RedisService({ REDIS_URL: 'redis://127.0.0.1:1' } as never);
}

describe('RedisService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects lazily and fails fast instead of queueing commands', () => {
    const redis = create();
    expect(redis.status).toBe('wait');
    expect(redis.options).toMatchObject({ lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.disconnect();
  });

  it('logs only the error code, once per outage, and the recovery', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const redis = create();
    const error = Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:6379 pass=hunter2'), {
      code: 'ECONNREFUSED',
    });

    redis.emit('error', error);
    redis.emit('error', error);
    redis.emit('error', new Error('WRONGPASS hunter2'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Redis connection error (ECONNREFUSED)');

    redis.emit('ready');
    expect(log).toHaveBeenCalledWith('Redis connection restored');
    redis.emit('error', new Error('WRONGPASS hunter2'));
    expect(warn).toHaveBeenLastCalledWith('Redis connection error (unknown)');
    expect(JSON.stringify([...warn.mock.calls, ...log.mock.calls])).not.toMatch(/hunter2|10\.1/);
    redis.disconnect();
  });
});
