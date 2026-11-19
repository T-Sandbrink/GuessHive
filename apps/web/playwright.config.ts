import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: {
    command: 'pnpm build && pnpm preview',
    port: 4173,
    // The preview server runs as production, where API_URL is required.
    env: { API_URL: 'http://localhost:3000' },
  },
  testMatch: '**/*.e2e.{ts,js}',
});
