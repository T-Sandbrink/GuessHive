import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { DISABLED_AUTH_PATHS, createAuth } from './auth.config.js';
import { emailPasswordMethod } from './email-password.js';
import { PASSWORD_FIELDS, type PasswordSettings } from './password-policy.js';

const env = {
  NODE_ENV: 'development',
  BETTER_AUTH_SECRET: 'development-only-better-auth-secret-not-for-production',
  BETTER_AUTH_URL: 'http://localhost:5173',
} as ApiEnv;
// Never queried: these tests only read the resolved options.
const prisma = {} as PrismaClient;
const settings: PasswordSettings = { get: vi.fn().mockResolvedValue(12) } as PasswordSettings;

describe('createAuth (task 2.1)', () => {
  it('enables only the extensions it is given', () => {
    const auth = createAuth(prisma, env, settings, { emailAndPassword: { enabled: true } });
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(createAuth(prisma, env, settings).options.emailAndPassword).toBeUndefined();
  });

  it('cannot override the base options through the extensions argument', () => {
    const base = createAuth(prisma, env, settings).options;
    const auth = createAuth(prisma, env, settings, {
      emailAndPassword: { enabled: true },
      advanced: { disableOriginCheck: true, disableCSRFCheck: true, cookiePrefix: 'evil' },
      databaseHooks: {},
      hooks: { before: undefined },
      disabledPaths: [],
      trustedOrigins: ['https://evil.example'],
      secret: 'attacker-chosen-secret-of-at-least-32-chars',
      rateLimit: { enabled: true },
      user: { fields: {} },
    } as never);
    expect(auth.options.advanced).toEqual(base.advanced);
    expect(auth.options.advanced.disableOriginCheck).toBe(false);
    expect(auth.options.advanced.cookiePrefix).toBe('guesshive');
    expect(auth.options.disabledPaths).toEqual(DISABLED_AUTH_PATHS);
    expect(auth.options.databaseHooks.user.update.before).toBeTypeOf('function');
    expect(auth.options.databaseHooks.user.create.before).toBeTypeOf('function');
    expect(auth.options.databaseHooks.session.create.before).toBeTypeOf('function');
    expect(auth.options.hooks.before).toBeTypeOf('function');
    expect(auth.options.trustedOrigins).toEqual(['http://localhost:5173']);
    expect(auth.options.secret).toBe(env.BETTER_AUTH_SECRET);
    expect(auth.options.user.fields).toEqual({ name: 'displayUsername', image: 'avatarUrl' });
  });

  it('disables update-user and the session/account management endpoints', () => {
    expect(DISABLED_AUTH_PATHS).toEqual(
      expect.arrayContaining([
        '/update-user',
        '/list-sessions',
        '/update-session',
        '/link-social',
        '/unlink-account',
        '/get-access-token',
        '/refresh-token',
        '/account-info',
      ]),
    );
  });

  it('keeps origin and CSRF checks on and secure cookies in production', () => {
    const prod = createAuth(prisma, { ...env, NODE_ENV: 'production' }, settings).options.advanced;
    expect(prod.disableOriginCheck).toBe(false);
    expect(prod.useSecureCookies).toBe(true);
    expect(createAuth(prisma, env, settings).options.advanced.useSecureCookies).toBe(false);
  });
});

describe('createAuth with email + password (task 2.2)', () => {
  it('always installs the password policy as the before hook', () => {
    expect(createAuth(prisma, env, settings).options.hooks.before).toBeTypeOf('function');
    const auth = createAuth(
      prisma,
      env,
      settings,
      emailPasswordMethod({ sendInBackground: vi.fn() }),
    );
    expect(auth.options.hooks.before).toBeTypeOf('function');
  });

  it('passes the email + password options through', () => {
    const auth = createAuth(
      prisma,
      env,
      settings,
      emailPasswordMethod({ sendInBackground: vi.fn() }),
    );
    expect(auth.options.emailAndPassword).toMatchObject({
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    });
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
  });

  it('reads the minimum length through the settings it was given', async () => {
    const get = vi.fn().mockResolvedValue(30);
    const auth = createAuth(prisma, env, { get } as PasswordSettings);
    const hook = auth.options.hooks.before as unknown as (ctx: {
      path: string;
      body: unknown;
    }) => Promise<unknown>;
    await expect(
      hook({ path: '/sign-up/email', body: { password: 'x'.repeat(29) } }),
    ).rejects.toMatchObject({ body: { code: 'PASSWORD_TOO_SHORT', minLength: 30 } });
    expect(get).toHaveBeenCalledWith('auth.passwordMinLength');
  });
});

/** The body field names of a Better Auth endpoint (zod object schemas), if it declares any. */
function bodyKeys(endpoint: unknown): string[] {
  const options = (endpoint as { options?: { body?: unknown } }).options;
  const body = options?.body as { shape?: Record<string, unknown> } | undefined;
  return body?.shape ? Object.keys(body.shape) : [];
}

describe('every Better Auth endpoint that takes a password (task 2.2)', () => {
  const auth = createAuth(
    prisma,
    env,
    settings,
    emailPasswordMethod({ sendInBackground: vi.fn() }),
  );
  const endpoints = Object.values(auth.api as Record<string, unknown>).map((endpoint) => {
    const e = endpoint as { path?: string; options?: { metadata?: { SERVER_ONLY?: boolean } } };
    return {
      path: e.path,
      serverOnly: e.options?.metadata?.SERVER_ONLY === true,
      keys: bodyKeys(endpoint),
    };
  });
  /** Endpoints that only check the current password, never set one. */
  const VERIFY_ONLY = ['/sign-in/email', '/verify-password', '/delete-user'];

  it('finds the endpoints (the body schemas are still readable)', () => {
    expect(endpoints.find((e) => e.path === '/change-password')?.keys).toContain('newPassword');
    expect(endpoints.find((e) => e.path === '/reset-password')?.keys).toContain('newPassword');
  });

  it('checks every endpoint with a newPassword field, or it is server-only', () => {
    for (const endpoint of endpoints.filter((e) => e.keys.includes('newPassword'))) {
      if (endpoint.serverOnly) {
        continue;
      }
      expect(PASSWORD_FIELDS.get(endpoint.path ?? ''), endpoint.path).toBe('newPassword');
    }
  });

  it('checks or knowingly skips every endpoint with a password field', () => {
    for (const endpoint of endpoints.filter((e) => e.keys.includes('password'))) {
      if (endpoint.serverOnly || PASSWORD_FIELDS.get(endpoint.path ?? '') === 'password') {
        continue;
      }
      expect(VERIFY_ONLY, `${String(endpoint.path)} takes a password`).toContain(endpoint.path);
    }
  });

  it('checks sign-up, whose body is not a plain object schema', () => {
    expect(endpoints.some((e) => e.path === '/sign-up/email')).toBe(true);
    expect(PASSWORD_FIELDS.get('/sign-up/email')).toBe('password');
  });

  it('serves no setPassword route over HTTP', () => {
    const setPassword = (auth.api as Record<string, { path?: string }>)['setPassword'];
    expect(setPassword?.path).toBeUndefined();
  });
});

describe('Better Auth logging and account linking (task 2.2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type AuthLogger = {
    level: string;
    log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]) => void;
  };
  const logger = () => createAuth(prisma, env, settings).options.logger as unknown as AuthLogger;

  it('logs at warn and above', () => {
    expect(logger().level).toBe('warn');
  });

  it('forwards only the message of warn and error lines to the Nest logger', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const log = logger().log;
    log('warn', 'something odd', { email: 'jan@example.test' });
    log('error', 'something broke', new Error('token=secret'));
    expect(warn).toHaveBeenCalledWith('something odd');
    expect(error).toHaveBeenCalledWith('something broke');
    expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).not.toMatch(
      /jan@example|token=secret/,
    );
  });

  it('drops info and debug lines (they carry addresses and URLs)', () => {
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((method) =>
      vi.spyOn(Logger.prototype, method).mockImplementation(() => undefined),
    );
    logger().log('info', 'Reset link for jan@example.test: http://x/reset?token=abc');
    logger().log('debug', 'debug jan@example.test');
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('cannot be replaced through the extensions', () => {
    const auth = createAuth(prisma, env, settings, {
      logger: { level: 'debug', disabled: true },
    } as never);
    expect((auth.options.logger as unknown as AuthLogger).level).toBe('warn');
  });

  it('links another sign-in method only to a locally verified email', () => {
    const { account } = createAuth(prisma, env, settings).options;
    expect(account.accountLinking).toMatchObject({
      updateUserInfoOnLink: false,
      requireLocalEmailVerified: true,
    });
  });
});
