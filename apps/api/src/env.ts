import { nodeEnvSchema, parseEnv } from '@guesshive/shared';
import { z } from 'zod';

/** Every environment variable the api reads. Keep apps/api/.env.example in sync. */
export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates the api environment; throws (and so stops startup) when it is invalid. */
export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
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
