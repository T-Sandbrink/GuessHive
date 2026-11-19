import { building, dev } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { apiUrlSchema } from './env-schemas';

/**
 * Every environment variable the web server reads (all private). SvelteKit validates
 * them at startup and build; read them from `$app/env/private`.
 * Keep apps/web/.env.example in sync.
 */
export const variables = defineEnvVars({
  API_URL: { schema: apiUrlSchema(!dev && !building) },
});
