import { join } from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 never reads .env itself; load apps/api/.env for CLI commands (migrate, studio).
// Mirrors loadDotEnvFile in src/env.ts; keep both in sync.
// Self-contained on purpose: importing src/env.ts would pull in @guesshive/shared, whose
// build may not exist yet when turbo runs `db:generate`.
try {
  process.loadEnvFile(join(import.meta.dirname, '.env'));
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // `prisma migrate reset` runs the seed afterwards (task 1.4).
  migrations: { path: 'prisma/migrations', seed: 'pnpm run db:seed' },
  // `prisma generate` needs no database, so an empty URL is fine there;
  // migrate/studio then fail on the missing DATABASE_URL.
  datasource: { url: (process.env['DATABASE_URL'] ?? '').trim() },
});
