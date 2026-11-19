import { defineConfig } from 'prisma/config';
import { loadDotEnvFile } from './src/env.js';

// Prisma 7 never reads .env itself; load apps/api/.env for CLI commands
// (migrate, studio). `prisma generate` needs no database, so an empty URL is fine there.
loadDotEnvFile();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
