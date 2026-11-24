import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
  testDatabaseUrl,
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
  });

  it.each([
    ['the development database', 'postgresql://guesshive:secret@localhost:5440/guesshive'],
    ['a remote host', 'postgresql://u:secret@db.example.com:5432/guesshive_test'],
    ['a ?host= override', 'postgresql://u:secret@localhost/guesshive_test?host=10.0.0.5'],
    ['a ?hostaddr= override', 'postgresql://u:secret@localhost/guesshive_test?hostaddr=10.0.0.5'],
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
