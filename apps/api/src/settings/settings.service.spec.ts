import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import {
  SETTINGS_CACHE_PREFIX,
  SETTINGS_CACHE_TTL_SECONDS,
  SETTINGS_GENERATION_PREFIX,
  SETTINGS_REDIS_RETRY_MS,
  SettingsService,
} from './settings.service.js';

const KEY = 'auth.passwordMinLength';
const CACHE_KEY = SETTINGS_CACHE_PREFIX + KEY;
const ADMIN = '019ab1c2-0000-7000-8000-000000000001';

function setup(options: { stored?: unknown; redisDown?: boolean; dbDown?: boolean } = {}) {
  const store = new Map<string, string>();
  const state = { redisDown: options.redisDown ?? false };
  const down = () => Promise.reject(new Error('connect ECONNREFUSED 10.1.2.3 password=hunter2'));
  const redis = {
    get: vi.fn((k: string) => (state.redisDown ? down() : Promise.resolve(store.get(k) ?? null))),
    eval: vi.fn(
      (
        _script: string,
        _n: number,
        genKey: string,
        cacheKey: string,
        gen: string,
        entry: string,
      ) => {
        if (state.redisDown) {
          return down();
        }
        if ((store.get(genKey) ?? '') !== gen) {
          return Promise.resolve(0);
        }
        store.set(cacheKey, entry);
        return Promise.resolve(1);
      },
    ),
    multi: vi.fn(() => {
      const ops: (() => void)[] = [];
      const chain = {
        incr: (k: string) => {
          ops.push(() => store.set(k, String(Number(store.get(k) ?? 0) + 1)));
          return chain;
        },
        del: (k: string) => {
          ops.push(() => store.delete(k));
          return chain;
        },
        exec: () => {
          if (state.redisDown) {
            return down();
          }
          ops.forEach((op) => {
            op();
          });
          return Promise.resolve(ops.map(() => [null, 1]));
        },
      };
      return chain;
    }),
  };
  let row: { value: unknown } | null =
    options.stored === undefined ? null : { value: options.stored };
  const findUnique = vi.fn(() =>
    options.dbDown ? Promise.reject(new Error('db down')) : Promise.resolve(row),
  );
  const tx = {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    appSetting: {
      findUnique: vi.fn(() => Promise.resolve(row)),
      upsert: vi.fn((args: { update: { value: unknown } }) => {
        row = { value: args.update.value };
        return Promise.resolve({});
      }),
      deleteMany: vi.fn(() => {
        row = null;
        return Promise.resolve({ count: 1 });
      }),
    },
    auditLog: {
      create: vi.fn((_: { data: { action: string; meta: unknown } }) => Promise.resolve({})),
    },
  };
  const prisma = {
    appSetting: { findUnique },
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  const service = new SettingsService(prisma, redis as unknown as RedisService);
  return { service, redis, store, state, findUnique, tx };
}

describe('SettingsService', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the registry default when nothing is stored, and caches that', async () => {
    const { service, redis, findUnique } = setup();
    await expect(service.state(KEY)).resolves.toEqual({ key: KEY, value: 12, isDefault: true });
    await expect(service.get(KEY)).resolves.toBe(12);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      SETTINGS_GENERATION_PREFIX + KEY,
      CACHE_KEY,
      '',
      '{"default":true}',
      String(SETTINGS_CACHE_TTL_SECONDS),
    );
  });

  it('returns a stored value and serves it from the cache afterwards', async () => {
    const { service, findUnique, store } = setup({ stored: 16 });
    await expect(service.state(KEY)).resolves.toEqual({ key: KEY, value: 16, isDefault: false });
    await expect(service.get(KEY)).resolves.toBe(16);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(store.get(CACHE_KEY)).toBe('{"value":16}');
  });

  it.each([[4], [100], ['16'], [{ value: 16 }]])(
    'falls back to the default for a stored value outside the bounds (%j), warning once',
    async (stored) => {
      const { service } = setup({ stored });
      await expect(service.state(KEY)).resolves.toEqual({ key: KEY, value: 12, isDefault: true });
      await expect(service.get(KEY)).resolves.toBe(12);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(`Ignoring invalid stored value of setting ${KEY}`);
    },
  );

  it.each(['not json', '{"value":7}', '{"value":"16"}', '{"default":false}', '[]'])(
    'treats an invalid cache entry (%s) as a miss and rewrites it from the database',
    async (entry) => {
      const { service, store, findUnique } = setup({ stored: 20 });
      store.set(CACHE_KEY, entry);
      await expect(service.get(KEY)).resolves.toBe(20);
      expect(findUnique).toHaveBeenCalledTimes(1);
      expect(store.get(CACHE_KEY)).toBe('{"value":20}');
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('reads the database when Redis is down, skipping Redis for a while, logging once', async () => {
    vi.useFakeTimers();
    const { service, findUnique, redis, state } = setup({ stored: 14, redisDown: true });
    await expect(service.get(KEY)).resolves.toBe(14);
    await expect(service.get(KEY)).resolves.toBe(14);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(redis.get).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SETTINGS_REDIS_RETRY_MS);
    await service.get(KEY);
    expect(redis.get).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/hunter2|10\.1/);

    state.redisDown = false;
    vi.advanceTimersByTime(SETTINGS_REDIS_RETRY_MS);
    await expect(service.get(KEY)).resolves.toBe(14);
    await expect(service.get(KEY)).resolves.toBe(14);
    expect(findUnique).toHaveBeenCalledTimes(4);
  });

  it('throws when the database fails and the cache has nothing, never guessing a value', async () => {
    const { service } = setup({ dbDown: true });
    await expect(service.get(KEY)).rejects.toThrow('db down');
  });

  it('updates within the bounds, audits old → new and drops the cached value', async () => {
    const { service, store, tx } = setup({ stored: 14 });
    await service.get(KEY);
    await service.update(KEY, 16, ADMIN);
    expect(tx.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: KEY },
      update: { value: 16, updatedById: ADMIN },
      create: { key: KEY, value: 16, updatedById: ADMIN },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ADMIN,
        action: 'app_setting.update',
        targetType: 'AppSetting',
        targetId: KEY,
        meta: { from: 14, to: 16 },
      },
    });
    expect(store.has(CACHE_KEY)).toBe(false);
    await expect(service.get(KEY)).resolves.toBe(16);
  });

  it('does not cache a value read before a change made during the read', async () => {
    const { service, store, findUnique } = setup({ stored: 14 });
    findUnique.mockImplementationOnce(() => {
      // Another instance changes the setting while this read is between DB and cache.
      store.set(SETTINGS_GENERATION_PREFIX + KEY, '1');
      return Promise.resolve({ value: 14 });
    });
    await expect(service.get(KEY)).resolves.toBe(14);
    expect(store.has(CACHE_KEY)).toBe(false);
  });

  it('clears the cache on a change even inside the Redis skip window', async () => {
    const { service, state, redis, store } = setup({ stored: 14 });
    state.redisDown = true;
    await service.get(KEY);
    state.redisDown = false;
    store.set(CACHE_KEY, '{"value":14}');
    await service.update(KEY, 16, ADMIN);
    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(store.has(CACHE_KEY)).toBe(false);
  });

  it('still completes an update when Redis fails afterwards', async () => {
    const { service, state, tx } = setup({ stored: 14 });
    state.redisDown = true;
    await expect(service.update(KEY, 16, ADMIN)).resolves.toBeUndefined();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each([7, 65, '16', null])(
    'refuses %j with VALIDATION_FAILED and writes nothing',
    async (value) => {
      const { service, tx } = setup();
      await expect(service.update(KEY, value, ADMIN)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(tx.appSetting.upsert).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it('resets to the default by deleting the stored value, audited as a reset', async () => {
    const { service, tx } = setup({ stored: 20 });
    await service.reset(KEY, ADMIN);
    expect(tx.appSetting.deleteMany).toHaveBeenCalledWith({ where: { key: KEY } });
    expect(tx.auditLog.create.mock.calls[0]?.[0].data).toMatchObject({
      action: 'app_setting.reset',
      meta: { from: 20, to: null },
    });
  });

  it('refuses unknown keys with NOT_FOUND', async () => {
    const { service } = setup();
    const unknown = 'constructor' as typeof KEY;
    await expect(service.get(unknown)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.update(unknown, 1, ADMIN)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.reset(unknown, ADMIN)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists every registered setting', async () => {
    const { service } = setup();
    await expect(service.getAll()).resolves.toEqual([{ key: KEY, value: 12, isDefault: true }]);
  });
});
