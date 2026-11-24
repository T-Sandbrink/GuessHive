import { COUNTRY_CODES, LAUNCH_LOCAL_COUNTRIES, REGIONS } from '@guesshive/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_CATEGORIES, SEED_QUESTIONS } from '../../src/seed/seed-data.js';
import { createTestPrisma, seedTestDatabase, TEST_ADMIN_EMAIL } from './test-db.js';

const prisma = createTestPrisma();
const NOW = new Date('2026-11-24T12:00:00Z');

describe('seed against the test database (tasks 1.4, 1.10)', () => {
  beforeAll(async () => {
    await seedTestDatabase(prisma, NOW);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reads back the countries, with local content on for the launch countries only', async () => {
    expect(await prisma.country.count()).toBe(COUNTRY_CODES.length);
    const local = await prisma.country.findMany({
      where: { localEnabled: true },
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    expect(local.map((c) => c.code)).toEqual([...LAUNCH_LOCAL_COUNTRIES].sort());
    expect(await prisma.region.count()).toBe(REGIONS.length);
  });

  it('reads back the categories, with politics marked sensitive', async () => {
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(categories.map((c) => c.slug)).toEqual(SEED_CATEGORIES.map((c) => c.slug));
    expect(categories.filter((c) => c.sensitive).map((c) => c.slug)).toEqual(
      SEED_CATEGORIES.filter((c) => c.sensitive).map((c) => c.slug),
    );
  });

  it('reads back the admin and the sample questions', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } });
    expect(admin.role).toBe('ADMIN');
    expect(await prisma.question.count()).toBe(SEED_QUESTIONS.length);
    expect(await prisma.question.count({ where: { authorId: admin.id } })).toBe(
      SEED_QUESTIONS.length,
    );
  });

  it('is idempotent: a second run creates nothing new', async () => {
    const summary = await seedTestDatabase(prisma, NOW);
    expect(summary.questionsCreated).toBe(0);
    expect(summary.questionsSkipped).toBe(SEED_QUESTIONS.length);
    expect(await prisma.question.count()).toBe(SEED_QUESTIONS.length);
    expect(await prisma.user.count()).toBe(1);
  });
});
