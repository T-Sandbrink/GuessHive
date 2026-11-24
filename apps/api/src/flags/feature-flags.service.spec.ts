import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { FEATURE_FLAG_CACHE_MS, FeatureFlagsService } from './feature-flags.service.js';

const SAM = '019ab1c2-0000-7000-8000-000000000001';
const KIM = '019ab1c2-0000-7000-8000-000000000002';

type Row = { key: string; enabled: boolean; rules: unknown };

function setup(rows: () => Promise<Row[]>) {
  const findMany = vi.fn(rows);
  const prisma = { featureFlag: { findMany } } as unknown as PrismaService;
  return { service: new FeatureFlagsService(prisma, { NODE_ENV: 'production' }), findMany };
}

describe('FeatureFlagsService', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the registry default (off) when the flag has no row', async () => {
    const { service } = setup(() => Promise.resolve([]));
    await expect(service.isEnabled('groups.stakeNote', { userId: SAM })).resolves.toBe(false);
  });

  it('is on for everyone when the row is enabled', async () => {
    const { service } = setup(() =>
      Promise.resolve([{ key: 'groups.stakeNote', enabled: true, rules: {} }]),
    );
    await expect(service.isEnabled('groups.stakeNote')).resolves.toBe(true);
    await expect(service.isEnabled('groups.stakeNote', { userId: KIM })).resolves.toBe(true);
  });

  it('is on only for listed users while the flag is off', async () => {
    const { service } = setup(() =>
      Promise.resolve([{ key: 'groups.stakeNote', enabled: false, rules: { userIds: [SAM] } }]),
    );
    await expect(service.isEnabled('groups.stakeNote', { userId: SAM })).resolves.toBe(true);
    await expect(service.isEnabled('groups.stakeNote', { userId: KIM })).resolves.toBe(false);
    await expect(service.isEnabled('groups.stakeNote')).resolves.toBe(false);
    await expect(service.isEnabled('billing.premium', { userId: SAM })).resolves.toBe(false);
  });

  it('treats a row with invalid rules as off for everyone', async () => {
    const { service } = setup(() =>
      Promise.resolve([{ key: 'groups.stakeNote', enabled: true, rules: { userIds: 'all' } }]),
    );
    await expect(service.isEnabled('groups.stakeNote', { userId: SAM })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith('Ignoring invalid rules of feature flag groups.stakeNote');
  });

  it('ignores rows for unregistered keys', async () => {
    const { service } = setup(() =>
      Promise.resolve([{ key: 'old.flag', enabled: true, rules: {} }]),
    );
    await expect(service.evaluateAll()).resolves.toEqual({
      'groups.stakeNote': false,
      'billing.premium': false,
    });
  });

  it('reads the table once per cache window, shared by concurrent callers', async () => {
    vi.useFakeTimers();
    const { service, findMany } = setup(() =>
      Promise.resolve([{ key: 'billing.premium', enabled: true, rules: {} }]),
    );
    await Promise.all([service.isEnabled('billing.premium'), service.evaluateAll()]);
    await service.isEnabled('billing.premium');
    expect(findMany).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FEATURE_FLAG_CACHE_MS);
    await service.isEnabled('billing.premium');
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known flags when the database fails, and logs no details', async () => {
    vi.useFakeTimers();
    let fail = false;
    const { service } = setup(() =>
      fail
        ? Promise.reject(new Error('connect ECONNREFUSED 10.1.2.3 password=hunter2'))
        : Promise.resolve([{ key: 'billing.premium', enabled: true, rules: {} }]),
    );
    await expect(service.isEnabled('billing.premium')).resolves.toBe(true);
    fail = true;
    vi.advanceTimersByTime(FEATURE_FLAG_CACHE_MS);
    await expect(service.isEnabled('billing.premium')).resolves.toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/hunter2|10\.1/);
  });

  it('falls back to the defaults (off) when the first read fails', async () => {
    const { service } = setup(() => Promise.reject(new Error('down')));
    await expect(service.isEnabled('billing.premium')).resolves.toBe(false);
  });
});
