// CLI entry for `pnpm --filter api db:seed`: fills the development database (task 1.4).
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { loadDotEnvFile, loadEnv } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { assertSeedAllowed } from './guard.js';
import { SEED_ADMIN } from './seed-data.js';
import { seed } from './seed.js';

loadDotEnvFile();
// Before loadEnv: an unset NODE_ENV parses as production, whose errors would hide this hint.
if (!process.env['NODE_ENV']?.trim()) {
  throw new Error('Refusing to seed: set NODE_ENV explicitly (development or test).');
}
const env = loadEnv();
const adminEmail = z
  .email()
  .default(SEED_ADMIN.defaultEmail)
  .parse(process.env['SEED_ADMIN_EMAIL']?.trim() || undefined);
// Raw NODE_ENV on purpose: only an explicitly set, non-production value may seed.
assertSeedAllowed(env, process.env['NODE_ENV'], adminEmail);

const prisma = new PrismaClient({
  errorFormat: 'minimal',
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
try {
  const summary = await seed(prisma, { adminEmail });
  process.stdout.write(`Seed done: ${JSON.stringify({ ...summary, admins: 1 })}\n`);
} finally {
  await prisma.$disconnect();
}
