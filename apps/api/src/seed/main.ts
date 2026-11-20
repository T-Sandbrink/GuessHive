// CLI entry for `pnpm --filter api db:seed`: fills the development database (task 1.4).
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { loadDotEnvFile, loadEnv } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { SEED_ADMIN } from './seed-data.js';
import { seed } from './seed.js';

loadDotEnvFile();
const env = loadEnv();
if (env.NODE_ENV === 'production') {
  throw new Error('The seed creates development data and never runs with NODE_ENV=production.');
}
const adminEmail = z
  .email()
  .default(SEED_ADMIN.defaultEmail)
  .parse(process.env['SEED_ADMIN_EMAIL']?.trim() || undefined);

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
