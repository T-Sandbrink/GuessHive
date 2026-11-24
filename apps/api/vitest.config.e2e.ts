import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      // HTTP tests never process jobs: the queues connect, the BullMQ workers stay closed.
      WORKERS_ENABLED: 'false',
    },
  },
});
