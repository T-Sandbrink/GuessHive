import { z } from 'zod';

/** Where the api runs during local development (`pnpm dev`). */
export const LOCAL_API_URL = 'http://127.0.0.1:3000';

/**
 * Whether Vercel Web Analytics runs (task 1.13). Off unless explicitly set to `true`: it is
 * switched on only in Vercel's Production environment, after the owner's legal check and the
 * Vercel DPA (ADR 0005), never in previews or locally.
 */
export const analyticsEnabledSchema = z.stringbool().default(false);

/**
 * Internal base URL of the NestJS api, used by server load functions and the /api proxy.
 * Required in production (fail fast, AGENTS.md §7); defaults to the local api in dev and builds.
 */
export function apiUrlSchema(required: boolean) {
  const url = z.url({ protocol: /^https?$/ });
  return required ? url : url.default(LOCAL_API_URL);
}
