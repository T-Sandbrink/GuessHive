import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import type { RedisService } from '../../src/redis/redis.service.js';
import { SETTINGS_CACHE_PREFIX, SettingsService } from '../../src/settings/settings.service.js';
import { testRedisUrl } from './test-db-url.js';
import { createTestPrisma, seedTestDatabase, TEST_ADMIN_EMAIL } from './test-db.js';

const KEY = 'auth.passwordMinLength';
const prisma = createTestPrisma();
const redis = new Redis(testRedisUrl(), { lazyConnect: true, maxRetriesPerRequest: 1 });
const service = () =>
  new SettingsService(prisma as unknown as PrismaService, redis as unknown as RedisService);

// Against the test database and Redis db 15 (tasks 1.10, 1.12).
describe('app settings against Postgres and Redis (task 1.12)', () => {
  let adminId: string;

  beforeAll(async () => {
    await seedTestDatabase(prisma);
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await redis.del(SETTINGS_CACHE_PREFIX + KEY);
  });

  afterAll(async () => {
    await redis.del(SETTINGS_CACHE_PREFIX + KEY);
    redis.disconnect();
    await prisma.$disconnect();
  });

  it('changes a setting for every instance, with the audit trail, and resets it', async () => {
    const [first, second] = [service(), service()];
    await expect(second.get(KEY)).resolves.toBe(12);
    await expect(redis.get(SETTINGS_CACHE_PREFIX + KEY)).resolves.toBe('{"default":true}');

    await first.update(KEY, 16, adminId);
    // The shared Redis cache was cleared, so another instance sees the new value at once.
    await expect(second.state(KEY)).resolves.toEqual({ key: KEY, value: 16, isDefault: false });
    await expect(
      prisma.appSetting.findUniqueOrThrow({ where: { key: KEY } }),
    ).resolves.toMatchObject({ value: 16, updatedById: adminId });

    await first.reset(KEY, adminId);
    await expect(second.state(KEY)).resolves.toEqual({ key: KEY, value: 12, isDefault: true });
    await expect(prisma.appSetting.count({ where: { key: KEY } })).resolves.toBe(0);

    const audit = await prisma.auditLog.findMany({
      where: { targetType: 'AppSetting', targetId: KEY },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => [entry.action, entry.actorId, entry.meta])).toEqual([
      ['app_setting.update', adminId, { from: null, to: 16 }],
      ['app_setting.update', adminId, { from: 16, to: null }],
    ]);
  });

  it('refuses a value outside the hard bounds without writing anything', async () => {
    await expect(service().update(KEY, 7, adminId)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(prisma.appSetting.count()).resolves.toBe(0);
  });
});
