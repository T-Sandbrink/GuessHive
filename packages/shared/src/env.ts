import { z } from 'zod';

/**
 * Parses environment variables with a zod schema, once at startup (AGENTS.md §7).
 * On failure it throws an error that names the invalid variables and why, but
 * never echoes their values, because env vars can hold secrets.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined>,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    return `- ${key}: ${issue.message}`;
  });
  throw new Error(`Invalid environment variables:\n${problems.join('\n')}`);
}

/** Runtime mode shared by web and api. */
export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');
