import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/integration/test-db-url.js';

// Integration tests (task 1.10) against the docker compose `postgres-test` container and Redis.
// Run with `pnpm --filter api test:integration` after `docker compose up -d`.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int-spec.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup.ts'],
    // One shared database: files run one after another, each starting from an empty schema.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      // The api under test (ConfigModule) connects to the test database too.
      DATABASE_URL: testDatabaseUrl(),
    },
  },
});
