import { join } from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 never reads .env itself; load apps/api/.env for CLI commands (migrate, studio).
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
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` needs no database, so an empty URL is fine there;
  // migrate/studio then fail on the missing DATABASE_URL.
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
