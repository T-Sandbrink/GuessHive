// Runs once before all integration test files: applies the migrations to the test database.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './test-db-url.js';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export default function setup(): void {
  const url = testDatabaseUrl();
  // `migrate deploy` only applies committed migrations (never generates one or prompts).
  // DATABASE_URL in the environment wins over apps/api/.env (process.loadEnvFile never
  // overwrites a set variable), so this can never touch the development database.
  execFileSync(
    process.execPath,
    [join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
}
