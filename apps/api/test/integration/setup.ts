// Runs in every integration test file: starts each file from an empty, migrated database.
import { afterAll, beforeAll } from 'vitest';
import { createTestPrisma, resetDatabase } from './test-db.js';

const prisma = createTestPrisma();

beforeAll(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});
