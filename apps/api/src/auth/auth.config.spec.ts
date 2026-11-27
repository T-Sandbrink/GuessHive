import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { DISABLED_AUTH_PATHS, createAuth } from './auth.config.js';
import {
  SESSION_COOKIE_ATTRIBUTES,
  SESSION_FRESH_AGE_SECONDS,
  SESSION_REFRESH_SECONDS,
  SESSION_TTL_SECONDS,
} from './session-policy.js';

const env = {
  NODE_ENV: 'development',
  BETTER_AUTH_SECRET: 'development-only-better-auth-secret-not-for-production',
  BETTER_AUTH_URL: 'http://localhost:5173',
} as ApiEnv;
// Never queried: these tests only read the resolved options.
const prisma = {} as PrismaClient;

describe('createAuth (task 2.1)', () => {
  it('enables only the extensions it is given', () => {
    const auth = createAuth(prisma, env, { emailAndPassword: { enabled: true } });
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(createAuth(prisma, env).options.emailAndPassword).toBeUndefined();
  });

  it('cannot override the base options through the extensions argument', () => {
    const base = createAuth(prisma, env).options;
    const auth = createAuth(prisma, env, {
      emailAndPassword: { enabled: true },
      advanced: { disableOriginCheck: true, disableCSRFCheck: true, cookiePrefix: 'evil' },
      databaseHooks: {},
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
    const prod = createAuth(prisma, { ...env, NODE_ENV: 'production' }).options.advanced;
    expect(prod.disableOriginCheck).toBe(false);
    expect(prod.useSecureCookies).toBe(true);
    expect(createAuth(prisma, env).options.advanced.useSecureCookies).toBe(false);
  });
});

describe('session policy (task 2.7)', () => {
  it('uses the 30-day sliding expiry, refreshed at most once a day, without a cookie cache', () => {
    const { session } = createAuth(prisma, env).options;
    expect(SESSION_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(SESSION_REFRESH_SECONDS).toBe(24 * 60 * 60);
    expect(session.expiresIn).toBe(SESSION_TTL_SECONDS);
    expect(session.updateAge).toBe(SESSION_REFRESH_SECONDS);
    expect(SESSION_FRESH_AGE_SECONDS).toBe(24 * 60 * 60);
    expect(session.freshAge).toBe(SESSION_FRESH_AGE_SECONDS);
    expect(session.cookieCache.enabled).toBe(false);
  });

  it('reaches the resolved Better Auth session config', async () => {
    const ctx = await createAuth(prisma, env).$context;
    expect(ctx.sessionConfig.expiresIn).toBe(SESSION_TTL_SECONDS);
    expect(ctx.sessionConfig.updateAge).toBe(SESSION_REFRESH_SECONDS);
    expect(ctx.sessionConfig.freshAge).toBe(SESSION_FRESH_AGE_SECONDS);
  });

  it.each([
    ['production on https', 'production', 'https://guesshive.com', true],
    ['production on http (misconfigured)', 'production', 'http://localhost:5173', true],
    [
      'development on an https origin (staging)',
      'development',
      'https://staging.guesshive.com',
      true,
    ],
    ['test on an https origin', 'test', 'https://localhost:5173', true],
    ['development on http', 'development', 'http://localhost:5173', false],
    ['test on http', 'test', 'http://localhost:5173', false],
    ['an origin that only contains https', 'development', 'http://https.example', false],
  ] as const)('secure cookies for %s: %s', (_label, nodeEnv, url, secure) => {
    const options = createAuth(prisma, {
      ...env,
      NODE_ENV: nodeEnv,
      BETTER_AUTH_URL: url,
    }).options;
    expect(options.advanced.useSecureCookies).toBe(secure);
  });

  it('gives the session cookie Secure and the __Secure- prefix on an https origin outside production', async () => {
    const ctx = await createAuth(prisma, {
      ...env,
      BETTER_AUTH_URL: 'https://staging.guesshive.com',
    }).$context;
    expect(ctx.authCookies.sessionToken.name).toBe('__Secure-guesshive.session_token');
    expect(ctx.authCookies.sessionToken.attributes.secure).toBe(true);
  });

  it('pins HttpOnly, SameSite=Lax and Path=/ as the default cookie attributes', () => {
    expect(SESSION_COOKIE_ATTRIBUTES).toEqual({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(createAuth(prisma, env).options.advanced.defaultCookieAttributes).toEqual(
      SESSION_COOKIE_ATTRIBUTES,
    );
  });

  it('cannot be weakened through the extensions argument', () => {
    const auth = createAuth(prisma, env, {
      emailAndPassword: { enabled: true },
      session: { expiresIn: 365 * 24 * 60 * 60, cookieCache: { enabled: true } },
    } as never);
    expect(auth.options.session.expiresIn).toBe(SESSION_TTL_SECONDS);
    expect(auth.options.session.cookieCache.enabled).toBe(false);
  });

  it('gives the session cookie Secure and the __Secure- prefix in production, not on a plain http dev origin', async () => {
    const prod = await createAuth(prisma, { ...env, NODE_ENV: 'production' }).$context;
    expect(prod.authCookies.sessionToken).toEqual({
      name: '__Secure-guesshive.session_token',
      attributes: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
        maxAge: SESSION_TTL_SECONDS,
      },
    });
    const dev = await createAuth(prisma, env).$context;
    expect(dev.authCookies.sessionToken.name).toBe('guesshive.session_token');
    expect(dev.authCookies.sessionToken.attributes).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: SESSION_TTL_SECONDS,
    });
  });

  it('keeps every Better Auth cookie HttpOnly and SameSite=Lax, not only the session token', async () => {
    const { authCookies } = await createAuth(prisma, { ...env, NODE_ENV: 'production' }).$context;
    for (const cookie of Object.values(authCookies)) {
      expect(cookie.attributes).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true });
    }
  });

  it('disables revoke-session but keeps sign-out and both "sign out elsewhere" endpoints', () => {
    expect(DISABLED_AUTH_PATHS).toContain('/revoke-session');
    for (const path of [
      '/sign-out',
      '/revoke-sessions',
      '/revoke-other-sessions',
      '/get-session',
    ]) {
      expect(DISABLED_AUTH_PATHS).not.toContain(path);
    }
  });
});
