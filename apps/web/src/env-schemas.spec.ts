import { describe, expect, it } from 'vitest';
import { analyticsEnabledSchema, apiUrlSchema, LOCAL_API_URL } from './env-schemas';

describe('apiUrlSchema', () => {
  it('defaults to the local api in development', () => {
    expect(apiUrlSchema(false).parse(undefined)).toBe(LOCAL_API_URL);
  });

  it('is required in production', () => {
    expect(apiUrlSchema(true).safeParse(undefined).success).toBe(false);
  });

  it('accepts an http(s) URL', () => {
    expect(apiUrlSchema(true).parse('https://api.internal:8443')).toBe('https://api.internal:8443');
  });

  it('rejects a malformed or non-http URL', () => {
    expect(apiUrlSchema(false).safeParse('not a url').success).toBe(false);
    expect(apiUrlSchema(false).safeParse('ftp://example.com').success).toBe(false);
  });
});

describe('analyticsEnabledSchema', () => {
  it('is off unless explicitly switched on', () => {
    expect(analyticsEnabledSchema.parse(undefined)).toBe(false);
    expect(analyticsEnabledSchema.parse('false')).toBe(false);
    expect(analyticsEnabledSchema.parse('true')).toBe(true);
  });

  it('rejects anything that is not a boolean string', () => {
    expect(analyticsEnabledSchema.safeParse('maybe').success).toBe(false);
  });
});
