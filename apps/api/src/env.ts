import { nodeEnvSchema, parseEnv } from '@guesshive/shared';
import { z } from 'zod';

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
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates the api environment; throws (and so stops startup) when it is invalid. */
export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const env = parseEnv(apiEnvSchema, source);
  // The REDIS_URL default is for local development only; production must set it (fail fast).
  if (env.NODE_ENV === 'production' && !source['REDIS_URL']?.trim()) {
    throw new Error('Invalid environment variables:\n- REDIS_URL: required in production');
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
