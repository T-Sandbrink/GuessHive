import { nodeEnvSchema, parseEnv } from '@guesshive/shared';
import { z } from 'zod';

/** Local development and test only; rejected in production (see loadEnv). */
const DEV_IP_HASH_SECRET = 'development-only-ip-hash-secret-not-for-production';

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
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates the api environment; throws (and so stops startup) when it is invalid. */
export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const env = parseEnv(apiEnvSchema, source);
  // The REDIS_URL and IP_HASH_SECRET defaults are for local development only; production must
  // set both (fail fast).
  if (env.NODE_ENV === 'production') {
    const problems = ['REDIS_URL', 'IP_HASH_SECRET']
      .filter((key) => !source[key]?.trim())
      .map((key) => `- ${key}: required in production`);
    // The published development secret is as good as none.
    if (source['IP_HASH_SECRET']?.trim() === DEV_IP_HASH_SECRET) {
      problems.push('- IP_HASH_SECRET: must not be the development default');
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
