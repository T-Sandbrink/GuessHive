// Test database URL handling, free of Prisma imports so vitest.config can use it (task 1.10).

/** docker compose `postgres-test` (tmpfs, port 5441). Override with TEST_DATABASE_URL. */
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://guesshive:guesshive@localhost:5441/guesshive_test';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Query parameters that cannot change which server or database is reached. */
const ALLOWED_PARAMS = new Set(['sslmode', 'schema', 'connect_timeout']);

/**
 * The integration tests empty every table, so they refuse any database that is not clearly a
 * local test database: loopback host, name ending in `_test`, and no query parameters that
 * could redirect the connection (`?host=`, `?port=`, `?user=`, …; only a small allowlist).
 * Errors never include the URL, since it holds credentials.
 */
export function assertTestDatabaseUrl(raw: string): string {
  let url: URL;
  let database: string;
  try {
    url = new URL(raw);
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Refusing to run integration tests: TEST_DATABASE_URL is not a valid URL.');
  }
  if (
    !/^postgres(ql)?:$/.test(url.protocol) ||
    [...url.searchParams.keys()].some((key) => !ALLOWED_PARAMS.has(key)) ||
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

/**
 * The validated test database URL: TEST_DATABASE_URL (read from the shell, never from a .env
 * file), or the docker compose default. Set it when POSTGRES_TEST_PORT moves the container.
 */
export function testDatabaseUrl(): string {
  return assertTestDatabaseUrl(
    process.env['TEST_DATABASE_URL']?.trim() || DEFAULT_TEST_DATABASE_URL,
  );
}

/**
 * Redis for the api under test: TEST_REDIS_URL, or db 15 of the docker compose Redis, so tests
 * never share keys with development (which uses db 0).
 */
export function testRedisUrl(): string {
  return process.env['TEST_REDIS_URL']?.trim() || 'redis://127.0.0.1:6379/15';
}
