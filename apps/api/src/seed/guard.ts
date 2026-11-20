import type { ApiEnv } from '../env.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const RESERVED_EMAIL_SUFFIXES = ['.test', '.example', '.localhost'];

/**
 * The seed writes development data and an ADMIN account, so it fails closed: only against a
 * database on this machine, with NODE_ENV explicitly set to something other than production, and
 * with an admin email on a reserved domain nobody can receive mail on (RFC 2606/6761). Errors
 * never include the database URL, since it holds credentials.
 */
export function assertSeedAllowed(
  env: Pick<ApiEnv, 'DATABASE_URL'>,
  rawNodeEnv: string | undefined,
  adminEmail: string,
): void {
  if (rawNodeEnv === undefined || rawNodeEnv.trim() === '') {
    throw new Error('Refusing to seed: set NODE_ENV explicitly (development or test).');
  }
  if (rawNodeEnv.trim() === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production.');
  }
  const url = new URL(env.DATABASE_URL);
  // pg lets ?host= / ?hostaddr= override the URL's host, so those are refused outright.
  if (
    url.searchParams.has('host') ||
    url.searchParams.has('hostaddr') ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new Error('Refusing to seed: DATABASE_URL does not point to localhost.');
  }
  const domain = adminEmail.slice(adminEmail.lastIndexOf('@') + 1).toLowerCase();
  if (!RESERVED_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix))) {
    throw new Error(
      `Refusing to seed: SEED_ADMIN_EMAIL must use a reserved domain (${RESERVED_EMAIL_SUFFIXES.join(', ')}).`,
    );
  }
}
