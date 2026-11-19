import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from './errors.js';

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
