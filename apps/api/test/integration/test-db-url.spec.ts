import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertTestDatabaseUrl,
  assertTestRedisUrl,
  DEFAULT_TEST_DATABASE_URL,
  DEFAULT_TEST_REDIS_URL,
  testDatabaseUrl,
  testRedisUrl,
} from './test-db-url.js';

// Unit test (runs in `pnpm test`, no database needed): the integration tests truncate every
// table, so the URL guard must refuse anything but a local *_test database.
describe('test database URL guard (task 1.10)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the docker compose test database', () => {
    expect(assertTestDatabaseUrl(DEFAULT_TEST_DATABASE_URL)).toBe(DEFAULT_TEST_DATABASE_URL);
    expect(assertTestDatabaseUrl('postgres://u:p@127.0.0.1:5432/other_test')).toBeTruthy();
    expect(assertTestDatabaseUrl('postgresql://u:p@[::1]:5432/x_test')).toBeTruthy();
    expect(assertTestDatabaseUrl('postgresql://u:p@localhost/x_test?sslmode=disable')).toBeTruthy();
  });

  it.each([
    ['the development database', 'postgresql://guesshive:secret@localhost:5440/guesshive'],
    ['a remote host', 'postgresql://u:secret@db.example.com:5432/guesshive_test'],
    ['a ?host= override', 'postgresql://u:secret@localhost/guesshive_test?host=10.0.0.5'],
    ['a ?hostaddr= override', 'postgresql://u:secret@localhost/guesshive_test?hostaddr=10.0.0.5'],
    ['a ?port= override', 'postgresql://u:secret@localhost:5441/guesshive_test?port=5440'],
    ['a ?user= override', 'postgresql://u:secret@localhost/guesshive_test?user=postgres'],
    ['a malformed escape', 'postgresql://u:secret@localhost/%E0_test'],
    ['a name that only contains _test', 'postgresql://u:secret@localhost/guesshive_test_prod'],
    ['another protocol', 'mysql://u:secret@localhost/guesshive_test'],
    ['an invalid URL', 'not a url secret'],
  ])('refuses %s, without echoing the URL', (_, url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow(/^Refusing to run integration tests/);
    expect(() => assertTestDatabaseUrl(url)).not.toThrow(/secret/);
  });

  it('uses TEST_DATABASE_URL when set, else the docker compose default', () => {
    vi.stubEnv('TEST_DATABASE_URL', '  ');
    expect(testDatabaseUrl()).toBe(DEFAULT_TEST_DATABASE_URL);
    vi.stubEnv('TEST_DATABASE_URL', 'postgresql://u:p@localhost:6000/ci_test');
    expect(testDatabaseUrl()).toBe('postgresql://u:p@localhost:6000/ci_test');
    vi.stubEnv('TEST_DATABASE_URL', 'postgresql://u:p@localhost:6000/guesshive');
    expect(() => testDatabaseUrl()).toThrow(/Refusing/);
  });
});

// The queue tests (task 1.8) delete Redis keys, so the Redis URL gets the same kind of guard.
describe('test Redis URL guard (task 1.8)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a local Redis with a database other than 0', () => {
    expect(assertTestRedisUrl(DEFAULT_TEST_REDIS_URL)).toBe(DEFAULT_TEST_REDIS_URL);
    expect(assertTestRedisUrl('redis://localhost:6380/3')).toBeTruthy();
    expect(assertTestRedisUrl('redis://:secret@[::1]:6379/15')).toBeTruthy();
  });

  it.each([
    ['database 0', 'redis://:secret@127.0.0.1:6379/0'],
    ['no database (defaults to 0)', 'redis://:secret@127.0.0.1:6379'],
    ['a remote host', 'redis://:secret@cache.example.com:6379/15'],
    ['TLS to a remote host', 'rediss://:secret@cache.example.com:6380/15'],
    ['a query parameter', 'redis://:secret@127.0.0.1:6379/15?db=0'],
    ['a database out of range', 'redis://:secret@127.0.0.1:6379/123'],
    ['an invalid URL', 'not a url secret'],
  ])('refuses %s, without echoing the URL', (_, url) => {
    expect(() => assertTestRedisUrl(url)).toThrow(/^Refusing to run integration tests/);
    expect(() => assertTestRedisUrl(url)).not.toThrow(/secret/);
  });

  it('uses TEST_REDIS_URL when set, else database 15 of the docker compose Redis', () => {
    vi.stubEnv('TEST_REDIS_URL', '  ');
    expect(testRedisUrl()).toBe(DEFAULT_TEST_REDIS_URL);
    vi.stubEnv('TEST_REDIS_URL', 'redis://127.0.0.1:6390/2');
    expect(testRedisUrl()).toBe('redis://127.0.0.1:6390/2');
    vi.stubEnv('TEST_REDIS_URL', 'redis://127.0.0.1:6379/0');
    expect(() => testRedisUrl()).toThrow(/TEST_REDIS_URL/);
  });
});
