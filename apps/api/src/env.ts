import { nodeEnvSchema, parseEnv } from '@guesshive/shared';
import { z } from 'zod';

/** Local development and test only; rejected in production (see loadEnv). */
const DEV_IP_HASH_SECRET = 'development-only-ip-hash-secret-not-for-production';
/** Local development and test only; rejected in production (see loadEnv). */
const DEV_BETTER_AUTH_SECRET = 'development-only-better-auth-secret-not-for-production';
/** Production secrets that must be set explicitly and must not equal their published default. */
const PRODUCTION_SECRETS = {
  IP_HASH_SECRET: DEV_IP_HASH_SECRET,
  BETTER_AUTH_SECRET: DEV_BETTER_AUTH_SECRET,
} as const;

/** Every environment variable the api reads. Keep apps/api/.env.example in sync. */
export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  /** Interface to listen on. Loopback by default; containers set 0.0.0.0. */
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /** pino log level. Unset: `silent` when NODE_ENV=test, else `info` (see logger.module.ts). */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  /** PostgreSQL connection string (local default: docker compose on port 5440). */
  DATABASE_URL: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^postgres(ql)?$/ })),
  /** Redis for jobs, rate limits and caches (local default: docker compose on port 6379). */
  REDIS_URL: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^rediss?$/ }))
    .default('redis://127.0.0.1:6379'),
  /**
   * Run the BullMQ workers in this process (owner decision 2026-11-24). `false` keeps the
   * queues (jobs can still be added) but processes nothing, so the workers can later move to a
   * separate process without a code change.
   */
  WORKERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /**
   * Secret key for hashing client IP addresses (HMAC-SHA256), so raw IPs are never stored, not
   * even in short-lived rate-limit keys (AGENTS.md §9). At least 32 characters; required in
   * production. Changing it only resets the rate-limit counters, so it is for rate limits only:
   * fraud signals (task 9.9) get their own key.
   */
  IP_HASH_SECRET: z.string().min(32).default(DEV_IP_HASH_SECRET),
  /**
   * Better Auth secret (task 2.1): signs session cookies and encrypts OAuth tokens. At least 32
   * characters; required in production. Rotating it signs everyone out.
   */
  BETTER_AUTH_SECRET: z.string().min(32).default(DEV_BETTER_AUTH_SECRET),
  /**
   * Public origin of the web app, where the browser reaches `/api/auth/*` through the SvelteKit
   * proxy (AGENTS.md §3). OAuth callbacks and email links point here, and it is the only origin
   * Better Auth trusts. https in production.
   */
  BETTER_AUTH_URL: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/ }))
    .transform((value) => new URL(value).origin)
    .default('http://localhost:5173'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates the api environment; throws (and so stops startup) when it is invalid. */
export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const env = parseEnv(apiEnvSchema, source);
  // The REDIS_URL, secret and BETTER_AUTH_URL defaults are for local development only;
  // production must set them all (fail fast).
  // Better Auth would add these origins to trustedOrigins on its own, past this schema; the web
  // origin (BETTER_AUTH_URL) is the only trusted one.
  if (source['BETTER_AUTH_TRUSTED_ORIGINS']?.trim()) {
    throw new Error(
      'Invalid environment variables:\n- BETTER_AUTH_TRUSTED_ORIGINS: not supported, use BETTER_AUTH_URL',
    );
  }
  if (env.NODE_ENV === 'production') {
    const problems = ['REDIS_URL', ...Object.keys(PRODUCTION_SECRETS), 'BETTER_AUTH_URL']
      .filter((key) => !source[key]?.trim())
      .map((key) => `- ${key}: required in production`);
    // A published development secret is as good as none.
    for (const [key, devDefault] of Object.entries(PRODUCTION_SECRETS)) {
      if (source[key]?.trim() === devDefault) {
        problems.push(`- ${key}: must not be the development default`);
      }
    }
    // Keys stay separate, so one leak does not expose the other's purpose.
    if (env.BETTER_AUTH_SECRET === env.IP_HASH_SECRET) {
      problems.push('- BETTER_AUTH_SECRET: must differ from IP_HASH_SECRET');
    }
    // Better Auth switches its origin and CSRF checks off when TEST is set.
    if (source['TEST']?.trim()) {
      problems.push('- TEST: must not be set in production');
    }
    if (source['BETTER_AUTH_URL']?.trim() && !env.BETTER_AUTH_URL.startsWith('https://')) {
      problems.push('- BETTER_AUTH_URL: must use https in production');
    }
    if (problems.length > 0) {
      throw new Error(`Invalid environment variables:\n${problems.join('\n')}`);
    }
  }
  return env;
}

/** Loads a local `.env` file when present. In production the host sets real env vars. */
export function loadDotEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}
