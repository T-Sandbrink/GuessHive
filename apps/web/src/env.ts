import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

/**
 * Schemas for every environment variable the web server reads (all private).
 * SvelteKit validates them at startup and build; read them from `$app/env/private`.
 * Keep apps/web/.env.example in sync.
 */
export const webEnvSchemas = {
  /** Internal base URL of the NestJS api, used by server load functions and the /api proxy. */
  API_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
};

export const variables = defineEnvVars({
  API_URL: { schema: webEnvSchemas.API_URL },
});
