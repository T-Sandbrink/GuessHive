import { describe, expect, it } from 'vitest';
import { localeSchema, SUPPORTED_LOCALES } from './locales.js';

describe('localeSchema', () => {
  it('accepts every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(localeSchema.parse(locale)).toBe(locale);
    }
  });

  it('rejects unsupported or malformed locales', () => {
    for (const value of ['de', 'NL', 'nl-NL', '', 42, null]) {
      expect(localeSchema.safeParse(value).success).toBe(false);
    }
  });
});
