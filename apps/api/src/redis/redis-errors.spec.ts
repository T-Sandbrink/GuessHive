import { describe, expect, it, vi } from 'vitest';
import { redisErrorCode, throttled } from './redis-errors.js';

describe('redisErrorCode', () => {
  it('returns the error code, never the message', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379 pw=hunter2'), {
      code: 'ECONNREFUSED',
    });
    expect(redisErrorCode(error)).toBe('ECONNREFUSED');
  });

  it('falls back to the error class name', () => {
    expect(redisErrorCode(new TypeError('job data: jan@example.com'))).toBe('TypeError');
  });
});

describe('throttled', () => {
  it('logs at most once per interval', () => {
    let now = 0;
    const log = vi.fn();
    const warn = throttled(log, 1_000, () => now);
    warn('a');
    now = 999;
    warn('b');
    now = 1_000;
    warn('c');
    expect(log.mock.calls).toEqual([['a'], ['c']]);
  });
});
