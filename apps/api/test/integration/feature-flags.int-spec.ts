import { afterAll, describe, expect, it } from 'vitest';
import { FeatureFlagsService } from '../../src/flags/feature-flags.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestPrisma, seedTestDatabase, TEST_ADMIN_EMAIL } from './test-db.js';

const prisma = createTestPrisma();
const service = () =>
  new FeatureFlagsService(prisma as unknown as PrismaService, { NODE_ENV: 'test' });

describe('feature flags against the test database (task 1.11)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('switches a flag for one user, then for everyone, with an audit trail', async () => {
    await seedTestDatabase(prisma);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } });
    const writer = service();

    await expect(writer.isEnabled('groups.stakeNote', { userId: admin.id })).resolves.toBe(false);

    await writer.update(
      'groups.stakeNote',
      { enabled: false, rules: { userIds: [admin.id, admin.id] } },
      admin.id,
    );
    // The writing instance sees the change at once; another instance reads it fresh.
    await expect(writer.isEnabled('groups.stakeNote', { userId: admin.id })).resolves.toBe(true);
    await expect(service().isEnabled('groups.stakeNote')).resolves.toBe(false);

    await writer.update('groups.stakeNote', { enabled: true, rules: { userIds: [] } }, admin.id);
    await expect(service().isEnabled('groups.stakeNote')).resolves.toBe(true);

    const row = await prisma.featureFlag.findUniqueOrThrow({ where: { key: 'groups.stakeNote' } });
    expect(row).toMatchObject({ enabled: true, rules: { userIds: [] } });

    const audit = await prisma.auditLog.findMany({
      where: { targetType: 'FeatureFlag', targetId: 'groups.stakeNote' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.meta)).toEqual([
      { from: null, to: { enabled: false, rules: { userIds: [admin.id] } } },
      {
        from: { enabled: false, rules: { userIds: [admin.id] } },
        to: { enabled: true, rules: { userIds: [] } },
      },
    ]);
    expect(audit.every((entry) => entry.actorId === admin.id)).toBe(true);
    expect(audit.every((entry) => entry.action === 'feature_flag.update')).toBe(true);
  });

  it('rejects invalid rules without writing anything', async () => {
    await expect(
      service().update('billing.premium', { enabled: true, rules: { userIds: ['sam'] } }, null),
    ).rejects.toThrow();
    await expect(prisma.featureFlag.count({ where: { key: 'billing.premium' } })).resolves.toBe(0);
  });
});
