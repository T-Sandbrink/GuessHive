import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase, seedTestDatabase } from './test-db.js';

const prisma = createTestPrisma();

function countRows(): Promise<number[]> {
  return Promise.all([
    prisma.country.count(),
    prisma.region.count(),
    prisma.category.count(),
    prisma.user.count(),
    prisma.question.count(),
  ]);
}

describe('per-file database reset (task 1.10)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('starts the test file with empty tables (setup.ts reset)', async () => {
    expect(await countRows()).toEqual([0, 0, 0, 0, 0]);
  });

  it('resetDatabase empties seeded tables, foreign keys included', async () => {
    await seedTestDatabase(prisma);
    expect((await countRows()).every((n) => n > 0)).toBe(true);
    await resetDatabase(prisma);
    expect(await countRows()).toEqual([0, 0, 0, 0, 0]);
  });

  it('keeps the migration history', async () => {
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    expect(Number(row?.n)).toBeGreaterThan(0);
  });
});
