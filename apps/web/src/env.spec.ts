import { describe, expect, it } from 'vitest';
import { webEnvSchemas } from './env';

describe('web env: API_URL', () => {
  const schema = webEnvSchemas.API_URL;

  it('defaults to the local api', () => {
    expect(schema.parse(undefined)).toBe('http://localhost:3000');
  });

  it('accepts an http(s) URL', () => {
    expect(schema.parse('https://api.internal:8443')).toBe('https://api.internal:8443');
  });

  it('rejects a malformed or non-http URL', () => {
    expect(schema.safeParse('not a url').success).toBe(false);
    expect(schema.safeParse('ftp://example.com').success).toBe(false);
  });
});
