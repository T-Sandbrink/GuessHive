/**
 * Cloudflare's published Turnstile test secrets (always pass, always fail, token already spent).
 * They only work with Cloudflare's test site keys, which return a dummy hostname and action, so
 * the hostname and action checks are skipped for them. Never accepted in production (loadEnv).
 * Kept free of imports, so env.ts can read it without loading Better Auth.
 */
export const TURNSTILE_TEST_SECRETS = [
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
] as const;

/** The always-pass test secret: the local development and test default. */
export const TURNSTILE_DEV_SECRET = TURNSTILE_TEST_SECRETS[0];
