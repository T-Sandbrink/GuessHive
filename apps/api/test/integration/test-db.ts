// Shared helpers for the integration tests (task 1.10). They run against the `postgres-test`
// docker compose container, never against the development database.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seed, type SeedSummary } from '../../src/seed/seed.js';
import { testDatabaseUrl } from './test-db-url.js';

/** Admin email for seeded test data (reserved `.test` domain, like the development seed). */
export const TEST_ADMIN_EMAIL = 'admin@guesshive.test';

/** A Prisma client on the test database. Callers disconnect it when done. */
export function createTestPrisma(): PrismaClient {
  return new PrismaClient({
    errorFormat: 'minimal',
    adapter: new PrismaPg({ connectionString: testDatabaseUrl(), max: 2 }),
  });
}

/**
 * Empties every application table (the migration history stays), so each test file starts
 * from the same blank, migrated schema. One TRUNCATE for all tables, so foreign keys between
 * them are no obstacle.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) {
    return;
  }
  // Table names come from the catalog, not from input; quoted as identifiers all the same.
  const tables = rows.map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}

/** Fills the test database with the development seed (task 1.4), at a fixed reference time. */
export function seedTestDatabase(prisma: PrismaClient, now?: Date): Promise<SeedSummary> {
  return seed(prisma, { adminEmail: TEST_ADMIN_EMAIL, ...(now ? { now } : {}) });
}
