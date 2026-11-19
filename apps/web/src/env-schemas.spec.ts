import { describe, expect, it } from 'vitest';
import { apiUrlSchema, LOCAL_API_URL } from './env-schemas';

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
