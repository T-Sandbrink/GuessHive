import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { nodeEnvSchema, parseEnv } from './env.js';

const schema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SECRET: z.string().min(8),
});

describe('parseEnv', () => {
  it('returns typed values and applies defaults', () => {
    const env = parseEnv(schema, { SECRET: 'long-enough' });

    // An unset NODE_ENV is production: fail safe (owner decision 2026-11-24).
    expect(env).toEqual({ NODE_ENV: 'production', PORT: 3000, SECRET: 'long-enough' });
  });

  it('coerces strings from the environment', () => {
    expect(parseEnv(schema, { PORT: '8080', SECRET: 'long-enough' }).PORT).toBe(8080);
  });

  it('names every invalid variable', () => {
    expect(() => parseEnv(schema, { NODE_ENV: 'staging', PORT: 'abc' })).toThrow(
      /NODE_ENV[\s\S]*PORT[\s\S]*SECRET/,
    );
  });

  it('never includes the rejected values in the error', () => {
    let message = '';
    try {
      parseEnv(schema, { SECRET: 'x7Qv' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('SECRET');
    expect(message).not.toContain('x7Qv');
  });
});
