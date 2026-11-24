// Runs once before all integration test files: applies the migrations to the test database.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './test-db-url.js';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The Prisma CLI entry, from the package's own `bin` field rather than a hard-coded path. */
function prismaCli(): string {
  const manifest = createRequire(import.meta.url).resolve('prisma/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: { prisma: string } };
  return join(dirname(manifest), bin.prisma);
}

export default function setup(): void {
  const url = testDatabaseUrl();
  // `migrate deploy` only applies committed migrations (never generates one or prompts).
  // DATABASE_URL in the environment wins over apps/api/.env (process.loadEnvFile never
  // overwrites a set variable), so this can never touch the development database.
  execFileSync(process.execPath, [prismaCli(), 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    // Prisma prints some failure details (e.g. P3009) on stdout.
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}
