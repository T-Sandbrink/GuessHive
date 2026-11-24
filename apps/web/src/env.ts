import { building, dev } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { analyticsEnabledSchema, apiUrlSchema } from './env-schemas';

/**
 * Every environment variable the web app reads. SvelteKit validates them at startup and build;
 * read private ones from `$app/env/private`, public ones from `$app/env/public`.
 * Keep apps/web/.env.example in sync.
 */
export const variables = defineEnvVars({
  API_URL: { schema: apiUrlSchema(!dev && !building) },
  /** Public and static: inlined at build time, so a build without it ships no analytics code path. */
  PUBLIC_ANALYTICS_ENABLED: { public: true, static: true, schema: analyticsEnabledSchema },
});
