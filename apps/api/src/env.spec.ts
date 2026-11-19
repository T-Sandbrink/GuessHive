import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const DATABASE_URL = 'postgresql://user:pass@localhost:5440/guesshive';

describe('loadEnv (api)', () => {
  it('uses safe defaults for local development', () => {
    expect(loadEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      DATABASE_URL,
    });
  });

  it('reads NODE_ENV, HOST and PORT from the environment', () => {
    expect(
      loadEnv({ NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8080', DATABASE_URL }),
    ).toMatchObject({ NODE_ENV: 'production', HOST: '0.0.0.0', PORT: 8080 });
  });

  it('requires a postgres DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(loadEnv({ DATABASE_URL: 'postgres://localhost/db' }).DATABASE_URL).toBe(
      'postgres://localhost/db',
    );
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ DATABASE_URL, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ DATABASE_URL, HOST: '' })).toThrow(/HOST/);
  });
});
