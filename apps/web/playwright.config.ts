import { defineConfig } from '@playwright/test';
import { LOCAL_API_URL } from './src/env-schemas';

export default defineConfig({
  webServer: {
    command: 'pnpm build && pnpm preview',
    port: 4173,
    // The preview server runs as production, where API_URL is required.
    env: { API_URL: LOCAL_API_URL },
  },
  testMatch: '**/*.e2e.{ts,js}',
});
