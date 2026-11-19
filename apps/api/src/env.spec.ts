import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv (api)', () => {
  it('uses safe defaults for local development', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3000 });
  });

  it('reads NODE_ENV and PORT from the environment', () => {
    expect(loadEnv({ NODE_ENV: 'production', PORT: '8080' })).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
    });
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
