import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import {
  SETTINGS_CACHE_PREFIX,
  SETTINGS_CACHE_TTL_SECONDS,
  SettingsService,
} from './settings.service.js';

const KEY = 'auth.passwordMinLength';
const ADMIN = '019ab1c2-0000-7000-8000-000000000001';

function setup(options: { stored?: unknown; redisDown?: boolean } = {}) {
  const cache = new Map<string, string>();
  const down = () => Promise.reject(new Error('connect ECONNREFUSED 10.1.2.3 password=hunter2'));
  const redis = {
    get: vi.fn((k: string) => (options.redisDown ? down() : Promise.resolve(cache.get(k) ?? null))),
    set: vi.fn((k: string, v: string) => {
      if (options.redisDown) {
        return down();
      }
      cache.set(k, v);
      return Promise.resolve('OK');
    }),
    del: vi.fn((k: string) =>
      options.redisDown ? down() : Promise.resolve(cache.delete(k) ? 1 : 0),
    ),
  };
  const row = options.stored === undefined ? null : { value: options.stored };
  const findUnique = vi.fn(() => Promise.resolve(row));
  const tx = {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    appSetting: {
      findUnique: vi.fn(() => Promise.resolve(row)),
      upsert: vi.fn(() => Promise.resolve({})),
      deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    auditLog: { create: vi.fn((_: { data: { meta: unknown } }) => Promise.resolve({})) },
  };
  const prisma = {
    appSetting: { findUnique },
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  const service = new SettingsService(prisma, redis as unknown as RedisService);
  return { service, redis, cache, findUnique, tx };
}

describe('SettingsService', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the registry default when nothing is stored, and caches that', async () => {
    const { service, redis, findUnique } = setup();
    await expect(service.state(KEY)).resolves.toEqual({ key: KEY, value: 12, isDefault: true });
    await expect(service.get(KEY)).resolves.toBe(12);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      SETTINGS_CACHE_PREFIX + KEY,
      '{"default":true}',
      'EX',
      SETTINGS_CACHE_TTL_SECONDS,
    );
  });

  it('returns a stored value and serves it from the cache afterwards', async () => {
    const { service, findUnique } = setup({ stored: 16 });
    await expect(service.state(KEY)).resolves.toEqual({ key: KEY, value: 16, isDefault: false });
    await expect(service.get(KEY)).resolves.toBe(16);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it.each([[4], [100], ['16'], [{ value: 16 }]])(
    'falls back to the default for a stored value outside the bounds (%j)',
    async (stored) => {
      const { service } = setup({ stored });
      await expect(service.state(KEY)).resolves.toEqual({ key: KEY, value: 12, isDefault: true });
      expect(warn).toHaveBeenCalledWith(`Ignoring invalid stored value of setting ${KEY}`);
    },
  );

  it('re-reads the database when the cached entry is unreadable', async () => {
    const { service, cache, findUnique } = setup({ stored: 20 });
    cache.set(SETTINGS_CACHE_PREFIX + KEY, 'not json');
    await expect(service.get(KEY)).resolves.toBe(20);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('reads the database when Redis is down, logging once without details', async () => {
    const { service, findUnique } = setup({ stored: 14, redisDown: true });
    await expect(service.get(KEY)).resolves.toBe(14);
    await expect(service.get(KEY)).resolves.toBe(14);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/hunter2|10\.1/);
  });

  it('updates within the bounds, audits old → new and drops the cached value', async () => {
    const { service, cache, tx } = setup({ stored: 14 });
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
    expect(cache.has(SETTINGS_CACHE_PREFIX + KEY)).toBe(false);
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

  it('resets to the default by deleting the stored value, audited as → null', async () => {
    const { service, tx } = setup({ stored: 20 });
    await service.reset(KEY, ADMIN);
    expect(tx.appSetting.deleteMany).toHaveBeenCalledWith({ where: { key: KEY } });
    expect(tx.auditLog.create.mock.calls[0]?.[0].data.meta).toEqual({ from: 20, to: null });
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
