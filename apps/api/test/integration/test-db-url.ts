// Test database URL handling, free of Prisma imports so vitest.config can use it (task 1.10).

/** docker compose `postgres-test` (tmpfs, port 5441). Override with TEST_DATABASE_URL. */
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://guesshive:guesshive@localhost:5441/guesshive_test';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The integration tests empty every table, so they refuse any database that is not clearly a
 * local test database: loopback host, no `?host=`/`?hostaddr=` override, name ending in `_test`.
 * Errors never include the URL, since it holds credentials.
 */
export function assertTestDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Refusing to run integration tests: TEST_DATABASE_URL is not a valid URL.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (
    !/^postgres(ql)?:$/.test(url.protocol) ||
    url.searchParams.has('host') ||
    url.searchParams.has('hostaddr') ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
    !database.endsWith('_test')
  ) {
    throw new Error(
      'Refusing to run integration tests: TEST_DATABASE_URL must be a PostgreSQL database on ' +
        'localhost whose name ends in _test.',
    );
  }
  return raw;
}

/** The validated test database URL (TEST_DATABASE_URL, or the docker compose default). */
export function testDatabaseUrl(): string {
  return assertTestDatabaseUrl(
    process.env['TEST_DATABASE_URL']?.trim() || DEFAULT_TEST_DATABASE_URL,
  );
}
