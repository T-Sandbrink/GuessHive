import { defineConfig } from 'vitest/config';
import { testRedisUrl } from './test/integration/test-db-url.js';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['test/e2e-setup.ts'],
    env: {
      // HTTP tests never process jobs: the queues connect, the BullMQ workers stay closed.
      WORKERS_ENABLED: 'false',
      // Guarded test database (db 15), so rate-limit counters never mix with development.
      REDIS_URL: testRedisUrl(),
    },
  },
});
