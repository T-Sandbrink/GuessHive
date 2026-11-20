import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, apiErrorBodySchema } from './errors.js';

describe('API_ERROR_CODES', () => {
  it('has no duplicates', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
  });

  it('uses SCREAMING_SNAKE_CASE codes only', () => {
    for (const code of API_ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    }
  });

  it('includes the generic fallbacks the api filter relies on', () => {
    expect(API_ERROR_CODES).toEqual(
      expect.arrayContaining(['BAD_REQUEST', 'INTERNAL_ERROR', 'VALIDATION_FAILED']),
    );
  });
});

describe('apiErrorBodySchema', () => {
  it('accepts a body without issues', () => {
    expect(apiErrorBodySchema.safeParse({ code: 'NOT_FOUND', message: 'Not found' }).success).toBe(
      true,
    );
  });

  it('accepts validation issues with a location, a path and a code', () => {
    const body = {
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      issues: [
        { location: 'body', path: ['options', 0, 'label'], code: 'too_small' },
        { location: 'params', path: ['id'], code: 'invalid_format' },
      ],
    };
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('rejects an issue path with other segment types', () => {
    const body = {
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      issues: [{ location: 'body', path: [true], code: 'custom' }],
    };
    expect(apiErrorBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects an issue without a known location', () => {
    for (const location of [undefined, 'headers', 'param']) {
      const body = {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        issues: [{ location, path: ['id'], code: 'invalid_format' }],
      };
      expect(apiErrorBodySchema.safeParse(body).success).toBe(false);
    }
  });
});
