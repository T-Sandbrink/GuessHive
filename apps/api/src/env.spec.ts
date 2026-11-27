import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const DEV = { NODE_ENV: 'development' };
const DATABASE_URL = 'postgresql://user:pass@localhost:5440/guesshive';
const IP_HASH_SECRET = 'a-production-secret-of-at-least-32-chars';
/** The Better Auth settings production requires (task 2.1). */
const AUTH = {
  BETTER_AUTH_SECRET: 'another-production-secret-of-32-chars-or-more',
  BETTER_AUTH_URL: 'https://guesshive.example',
};
/** The email settings production requires (task 2.2). */
const MAIL = {
  MAIL_TRANSPORT: 'resend',
  RESEND_API_KEY: 're_test_key_not_real',
  MAIL_FROM: 'GuessHive <hallo@guesshive.example>',
};

describe('loadEnv (api)', () => {
  it('treats an unset NODE_ENV as production, so production settings are required', () => {
    expect(() => loadEnv({ DATABASE_URL })).toThrow(/REDIS_URL: required in production/);
    expect(
      loadEnv({
        DATABASE_URL,
        REDIS_URL: 'rediss://cache.example',
        IP_HASH_SECRET,
        ...AUTH,
        ...MAIL,
      }).NODE_ENV,
    ).toBe('production');
  });

  it('uses safe defaults for local development', () => {
    expect(loadEnv({ NODE_ENV: 'development', DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      DATABASE_URL,
      REDIS_URL: 'redis://127.0.0.1:6379',
      WORKERS_ENABLED: true,
      IP_HASH_SECRET: 'development-only-ip-hash-secret-not-for-production',
      BETTER_AUTH_SECRET: 'development-only-better-auth-secret-not-for-production',
      BETTER_AUTH_URL: 'http://localhost:5173',
      MAIL_TRANSPORT: 'mailpit',
      MAILPIT_URL: 'http://127.0.0.1:8025',
      MAIL_FROM: 'GuessHive <noreply@guesshive.test>',
    });
  });

  it('reads WORKERS_ENABLED as a strict true/false switch', () => {
    expect(loadEnv({ ...DEV, DATABASE_URL, WORKERS_ENABLED: 'false' }).WORKERS_ENABLED).toBe(false);
    expect(loadEnv({ ...DEV, DATABASE_URL, WORKERS_ENABLED: 'true' }).WORKERS_ENABLED).toBe(true);
    expect(() => loadEnv({ ...DEV, DATABASE_URL, WORKERS_ENABLED: 'no' })).toThrow(
      /WORKERS_ENABLED/,
    );
    expect(() => loadEnv({ ...DEV, DATABASE_URL, WORKERS_ENABLED: '0' })).toThrow(
      /WORKERS_ENABLED/,
    );
  });

  it('requires REDIS_URL in production', () => {
    const prod = { NODE_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, ...AUTH, ...MAIL };
    expect(() => loadEnv(prod)).toThrow(/REDIS_URL/);
    expect(() => loadEnv({ ...prod, REDIS_URL: ' ' })).toThrow(/REDIS_URL/);
    expect(loadEnv({ ...prod, REDIS_URL: 'rediss://cache.example' }).REDIS_URL).toBe(
      'rediss://cache.example',
    );
  });

  it('requires an IP_HASH_SECRET of at least 32 characters in production', () => {
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL,
      REDIS_URL: 'rediss://cache.example',
      ...AUTH,
      ...MAIL,
    };
    expect(() => loadEnv(prod)).toThrow(/IP_HASH_SECRET: required in production/);
    expect(() => loadEnv({ ...prod, IP_HASH_SECRET: 'too-short' })).toThrow(/IP_HASH_SECRET/);
    expect(() => loadEnv({ ...prod, IP_HASH_SECRET: 'too-short' })).not.toThrow(/too-short/);
    expect(() =>
      loadEnv({ ...prod, IP_HASH_SECRET: ' development-only-ip-hash-secret-not-for-production ' }),
    ).toThrow(/IP_HASH_SECRET: must not be the development default/);
    expect(loadEnv({ ...prod, IP_HASH_SECRET }).IP_HASH_SECRET).toBe(IP_HASH_SECRET);
  });

  it('accepts redis and rediss URLs and rejects other schemes', () => {
    expect(
      loadEnv({ ...DEV, DATABASE_URL, REDIS_URL: 'rediss://cache.example:6380' }).REDIS_URL,
    ).toBe('rediss://cache.example:6380');
    expect(() => loadEnv({ ...DEV, DATABASE_URL, REDIS_URL: 'http://cache.example' })).toThrow(
      /REDIS_URL/,
    );
  });

  it('reads NODE_ENV, HOST and PORT from the environment', () => {
    expect(
      loadEnv({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        DATABASE_URL,
        REDIS_URL: 'rediss://cache.example',
        IP_HASH_SECRET,
        ...AUTH,
        ...MAIL,
      }),
    ).toMatchObject({ NODE_ENV: 'production', HOST: '0.0.0.0', PORT: 8080 });
  });

  it('requires a postgres DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...DEV, DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(loadEnv({ ...DEV, DATABASE_URL: 'postgres://localhost/db' }).DATABASE_URL).toBe(
      'postgres://localhost/db',
    );
  });

  it('accepts postgres URLs with query parameters and socket paths', () => {
    const withParams = 'postgresql://user:pass@db.example.com:5432/guesshive?sslmode=require';
    expect(loadEnv({ ...DEV, DATABASE_URL: withParams }).DATABASE_URL).toBe(withParams);
    const socket = 'postgresql:///guesshive?host=/var/run/postgresql';
    expect(loadEnv({ ...DEV, DATABASE_URL: socket }).DATABASE_URL).toBe(socket);
  });

  it('trims surrounding whitespace from DATABASE_URL', () => {
    const url = 'postgresql://user:pass@localhost:5440/guesshive';
    expect(loadEnv({ ...DEV, DATABASE_URL: `  ${url}\n` }).DATABASE_URL).toBe(url);
  });

  it.each([
    ['an empty string', ''],
    ['an http URL', 'http://localhost:5440/guesshive'],
    ['a look-alike scheme (suffix)', 'postgresqlx://localhost/db'],
    ['a look-alike scheme (prefix)', 'xpostgres://localhost/db'],
    ['a URL without a scheme', 'localhost:5440/guesshive'],
  ])('rejects %s as DATABASE_URL', (_label, value) => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL: value })).toThrow(/DATABASE_URL/);
  });

  it('never echoes DATABASE_URL credentials in the validation error', () => {
    expect(() =>
      loadEnv({ ...DEV, DATABASE_URL: 'mysql://admin:s3cr3t-pw@db.internal/guesshive' }),
    ).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('s3cr3t-pw') as unknown }),
    );
  });

  it('leaves LOG_LEVEL unset by default so the logger picks a per-env default', () => {
    expect(loadEnv({ ...DEV, DATABASE_URL }).LOG_LEVEL).toBeUndefined();
  });

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])(
    'accepts LOG_LEVEL=%s',
    (level) => {
      expect(loadEnv({ ...DEV, DATABASE_URL, LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
    },
  );

  it.each(['verbose', 'INFO', '', 'log'])('rejects LOG_LEVEL=%j', (level) => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, LOG_LEVEL: level })).toThrow(/LOG_LEVEL/);
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...DEV, DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ ...DEV, DATABASE_URL, HOST: '' })).toThrow(/HOST/);
  });
});

describe('loadEnv (api) Better Auth settings (task 2.1)', () => {
  const prod = {
    NODE_ENV: 'production',
    DATABASE_URL,
    REDIS_URL: 'rediss://cache.example',
    IP_HASH_SECRET,
    ...AUTH,
    ...MAIL,
  };

  it('accepts a complete production configuration', () => {
    expect(loadEnv(prod)).toMatchObject({
      BETTER_AUTH_SECRET: AUTH.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: 'https://guesshive.example',
    });
  });

  it('requires BETTER_AUTH_SECRET in production', () => {
    expect(() => loadEnv({ ...prod, BETTER_AUTH_SECRET: undefined })).toThrow(
      /BETTER_AUTH_SECRET: required in production/,
    );
    // A blank value already fails the schema (too short), so it can never fall back either.
    expect(() => loadEnv({ ...prod, BETTER_AUTH_SECRET: '  ' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('requires BETTER_AUTH_URL in production', () => {
    expect(() => loadEnv({ ...prod, BETTER_AUTH_URL: undefined })).toThrow(
      /BETTER_AUTH_URL: required in production/,
    );
    // A blank value already fails the schema (not a URL), so it can never fall back either.
    expect(() => loadEnv({ ...prod, BETTER_AUTH_URL: '  ' })).toThrow(/BETTER_AUTH_URL/);
  });

  it('reports both missing auth settings at once', () => {
    const { BETTER_AUTH_SECRET: _secret, BETTER_AUTH_URL: _url, ...rest } = prod;
    expect(() => loadEnv(rest)).toThrow(
      /BETTER_AUTH_SECRET: required in production[\s\S]*BETTER_AUTH_URL: required in production/,
    );
  });

  it('rejects the development BETTER_AUTH_SECRET in production, without echoing it', () => {
    const devSecret = 'development-only-better-auth-secret-not-for-production';
    expect(() => loadEnv({ ...prod, BETTER_AUTH_SECRET: devSecret })).toThrow(
      /BETTER_AUTH_SECRET: must not be the development default/,
    );
    expect(() => loadEnv({ ...prod, BETTER_AUTH_SECRET: ` ${devSecret} ` })).toThrow(
      /BETTER_AUTH_SECRET: must not be the development default/,
    );
    expect(() => loadEnv({ ...prod, BETTER_AUTH_SECRET: devSecret })).not.toThrow(
      /not-for-production/,
    );
  });

  it('allows the development BETTER_AUTH_SECRET outside production', () => {
    expect(loadEnv({ ...DEV, DATABASE_URL }).BETTER_AUTH_SECRET).toBe(
      'development-only-better-auth-secret-not-for-production',
    );
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters, without echoing it', () => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, BETTER_AUTH_SECRET: 'short-secret' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() => loadEnv({ ...prod, BETTER_AUTH_SECRET: 'short-secret' })).not.toThrow(
      /short-secret/,
    );
    expect(loadEnv({ ...DEV, DATABASE_URL, BETTER_AUTH_SECRET: 'x'.repeat(32) })).toMatchObject({
      BETTER_AUTH_SECRET: 'x'.repeat(32),
    });
  });

  it('requires an https BETTER_AUTH_URL in production', () => {
    expect(() => loadEnv({ ...prod, BETTER_AUTH_URL: 'http://guesshive.example' })).toThrow(
      /BETTER_AUTH_URL: must use https in production/,
    );
  });

  it('allows an http BETTER_AUTH_URL outside production', () => {
    expect(
      loadEnv({ ...DEV, DATABASE_URL, BETTER_AUTH_URL: 'http://localhost:4173' }).BETTER_AUTH_URL,
    ).toBe('http://localhost:4173');
  });

  it.each([
    ['a path', 'https://guesshive.example/nl/home', 'https://guesshive.example'],
    ['a trailing slash', 'https://guesshive.example/', 'https://guesshive.example'],
    ['a query and hash', 'https://guesshive.example/?a=1#x', 'https://guesshive.example'],
    ['upper case', 'HTTPS://GuessHive.Example', 'https://guesshive.example'],
    ['a default port', 'https://guesshive.example:443', 'https://guesshive.example'],
    ['a custom port', 'https://guesshive.example:8443/x', 'https://guesshive.example:8443'],
    ['whitespace', '  https://guesshive.example \n', 'https://guesshive.example'],
  ])('normalizes BETTER_AUTH_URL with %s to its origin', (_label, value, origin) => {
    expect(loadEnv({ ...prod, BETTER_AUTH_URL: value }).BETTER_AUTH_URL).toBe(origin);
  });

  it.each([
    ['development', { ...DEV, DATABASE_URL }],
    ['production', prod],
  ])('rejects BETTER_AUTH_TRUSTED_ORIGINS in %s', (_label, base) => {
    expect(() => loadEnv({ ...base, BETTER_AUTH_TRUSTED_ORIGINS: 'https://evil.example' })).toThrow(
      /BETTER_AUTH_TRUSTED_ORIGINS/,
    );
  });

  it('ignores a blank BETTER_AUTH_TRUSTED_ORIGINS', () => {
    expect(() => loadEnv({ ...prod, BETTER_AUTH_TRUSTED_ORIGINS: ' ' })).not.toThrow();
  });

  it('requires BETTER_AUTH_SECRET to differ from IP_HASH_SECRET in production', () => {
    const shared = 'one-secret-used-for-two-purposes-32-chars';
    expect(() => loadEnv({ ...prod, BETTER_AUTH_SECRET: shared, IP_HASH_SECRET: shared })).toThrow(
      /BETTER_AUTH_SECRET: must differ from IP_HASH_SECRET/,
    );
    expect(() =>
      loadEnv({ ...prod, BETTER_AUTH_SECRET: shared, IP_HASH_SECRET: shared }),
    ).not.toThrow(/one-secret-used/);
  });

  it('rejects TEST in production (it switches off Better Auth origin and CSRF checks)', () => {
    expect(() => loadEnv({ ...prod, TEST: '1' })).toThrow(/TEST: must not be set in production/);
    expect(() => loadEnv({ ...prod, TEST: 'false' })).toThrow(/TEST/);
    expect(() => loadEnv({ ...prod, TEST: ' ' })).not.toThrow();
    expect(() => loadEnv({ ...DEV, DATABASE_URL, TEST: '1' })).not.toThrow();
  });

  it.each([
    ['not a URL', 'guesshive.example'],
    ['an ftp URL', 'ftp://guesshive.example'],
    ['a javascript URL', 'javascript:alert(1)'],
  ])('rejects BETTER_AUTH_URL that is %s', (_label, value) => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, BETTER_AUTH_URL: value })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });
});

describe('loadEnv (api) email settings (task 2.2)', () => {
  const prod = {
    NODE_ENV: 'production',
    DATABASE_URL,
    REDIS_URL: 'rediss://cache.example',
    IP_HASH_SECRET,
    ...AUTH,
    ...MAIL,
  };

  it('accepts a complete production mail configuration', () => {
    expect(loadEnv(prod)).toMatchObject({
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: MAIL.RESEND_API_KEY,
      MAIL_FROM: MAIL.MAIL_FROM,
    });
  });

  it('defaults to Mailpit locally and leaves RESEND_API_KEY unset', () => {
    const env = loadEnv({ ...DEV, DATABASE_URL });
    expect(env.MAIL_TRANSPORT).toBe('mailpit');
    expect(env.MAILPIT_URL).toBe('http://127.0.0.1:8025');
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.MAIL_FROM).toBe('GuessHive <noreply@guesshive.test>');
  });

  it('requires MAIL_FROM in production, also when blank', () => {
    expect(() => loadEnv({ ...prod, MAIL_FROM: undefined })).toThrow(
      /MAIL_FROM: required in production/,
    );
    expect(() => loadEnv({ ...prod, MAIL_FROM: '   ' })).toThrow(/MAIL_FROM/);
  });

  it('requires MAIL_TRANSPORT=resend in production', () => {
    expect(() => loadEnv({ ...prod, MAIL_TRANSPORT: undefined })).toThrow(
      /MAIL_TRANSPORT: must be resend in production/,
    );
    expect(() => loadEnv({ ...prod, MAIL_TRANSPORT: 'mailpit' })).toThrow(
      /MAIL_TRANSPORT: must be resend in production/,
    );
  });

  it('requires RESEND_API_KEY with resend in production, without echoing a key', () => {
    expect(() => loadEnv({ ...prod, RESEND_API_KEY: undefined })).toThrow(
      /RESEND_API_KEY: required when MAIL_TRANSPORT is resend/,
    );
    expect(() => loadEnv({ ...prod, RESEND_API_KEY: '  ' })).toThrow(/RESEND_API_KEY/);
    expect(() => loadEnv({ ...prod, MAIL_FROM: undefined })).not.toThrow(/re_test_key_not_real/);
  });

  it('reports all missing mail settings at once', () => {
    const { MAIL_TRANSPORT: _t, RESEND_API_KEY: _k, MAIL_FROM: _f, ...rest } = prod;
    expect(() => loadEnv(rest)).toThrow(
      /MAIL_FROM: required in production[\s\S]*MAIL_TRANSPORT: must be resend in production/,
    );
  });

  it('allows Mailpit without MAIL_FROM or RESEND_API_KEY outside production', () => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAIL_TRANSPORT: 'mailpit' })).not.toThrow();
  });

  it('requires RESEND_API_KEY with resend in every environment', () => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAIL_TRANSPORT: 'resend' })).toThrow(
      /RESEND_API_KEY: required when MAIL_TRANSPORT is resend/,
    );
    expect(
      loadEnv({ ...DEV, DATABASE_URL, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_dev_key' })
        .MAIL_TRANSPORT,
    ).toBe('resend');
  });

  it.each([
    ['a bare address', 'hallo@guesshive.example'],
    ['a named address', 'GuessHive <hallo@guesshive.example>'],
    ['a name with spaces', 'De Bij van GuessHive <bij@guesshive.example>'],
    ['angle brackets only', '<hallo@guesshive.example>'],
  ])('accepts MAIL_FROM as %s', (_label, value) => {
    expect(loadEnv({ ...DEV, DATABASE_URL, MAIL_FROM: value }).MAIL_FROM).toBe(value);
  });

  it.each([
    ['no @', 'GuessHive'],
    ['no domain dot', 'hallo@localhost'],
    ['two addresses', 'a@b.example, c@d.example'],
    ['a header injection (LF)', 'GuessHive <a@b.example>\nBcc: x@evil.example'],
    ['a header injection (CRLF in the name)', 'Guess\r\nBcc: x@evil.example <a@b.example>'],
    ['an unclosed bracket', 'GuessHive <a@b.example'],
    ['a space in the address', 'GuessHive <a b@c.example>'],
    ['nested brackets', 'Guess <Hive> <a@b.example>'],
  ])('rejects MAIL_FROM with %s', (_label, value) => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAIL_FROM: value })).toThrow(/MAIL_FROM/);
  });

  it.each(['smtp', 'Resend', ''])('rejects MAIL_TRANSPORT=%j', (value) => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAIL_TRANSPORT: value })).toThrow(
      /MAIL_TRANSPORT/,
    );
  });

  it.each([
    ['not a URL', 'mailpit:8025'],
    ['an ftp URL', 'ftp://127.0.0.1:8025'],
  ])('rejects MAILPIT_URL that is %s', (_label, value) => {
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAILPIT_URL: value })).toThrow(/MAILPIT_URL/);
  });

  it('trims MAIL_FROM and bounds its length', () => {
    expect(loadEnv({ ...DEV, DATABASE_URL, MAIL_FROM: '  a@b.test  ' }).MAIL_FROM).toBe('a@b.test');
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAIL_FROM: 'ab' })).toThrow(/MAIL_FROM/);
    const long = `${'x'.repeat(190)}@guesshive.example`;
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAIL_FROM: long })).toThrow(/MAIL_FROM/);
    expect(() => loadEnv({ ...DEV, DATABASE_URL, MAIL_FROM: 'x'.repeat(201) })).toThrow(
      /MAIL_FROM/,
    );
  });
});
