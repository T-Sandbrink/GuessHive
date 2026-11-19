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

  it('accepts postgres URLs with query parameters and socket paths', () => {
    const withParams = 'postgresql://user:pass@db.example.com:5432/guesshive?sslmode=require';
    expect(loadEnv({ DATABASE_URL: withParams }).DATABASE_URL).toBe(withParams);
    const socket = 'postgresql:///guesshive?host=/var/run/postgresql';
    expect(loadEnv({ DATABASE_URL: socket }).DATABASE_URL).toBe(socket);
  });

  it.each([
    ['an empty string', ''],
    ['an http URL', 'http://localhost:5440/guesshive'],
    ['a look-alike scheme (suffix)', 'postgresqlx://localhost/db'],
    ['a look-alike scheme (prefix)', 'xpostgres://localhost/db'],
    ['a URL without a scheme', 'localhost:5440/guesshive'],
  ])('rejects %s as DATABASE_URL', (_label, value) => {
    expect(() => loadEnv({ DATABASE_URL: value })).toThrow(/DATABASE_URL/);
  });

  it('never echoes DATABASE_URL credentials in the validation error', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'mysql://admin:s3cr3t-pw@db.internal/guesshive' }),
    ).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('s3cr3t-pw') as unknown }),
    );
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ DATABASE_URL, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ DATABASE_URL, HOST: '' })).toThrow(/HOST/);
  });
});
