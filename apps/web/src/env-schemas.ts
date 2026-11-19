import { z } from 'zod';

/** Where the api runs during local development (`pnpm dev`). */
export const LOCAL_API_URL = 'http://127.0.0.1:3000';

/**
 * Internal base URL of the NestJS api, used by server load functions and the /api proxy.
 * Required in production (fail fast, AGENTS.md §7); defaults to the local api in dev and builds.
 */
export function apiUrlSchema(required: boolean) {
  const url = z.url({ protocol: /^https?$/ });
  return required ? url : url.default(LOCAL_API_URL);
}
