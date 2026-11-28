import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { DISABLED_AUTH_PATHS, createAuth } from './auth.config.js';

const env = {
  NODE_ENV: 'development',
  BETTER_AUTH_SECRET: 'development-only-better-auth-secret-not-for-production',
  BETTER_AUTH_URL: 'http://localhost:5173',
} as ApiEnv;
// Never queried: these tests only read the resolved options.
const prisma = {} as PrismaClient;

describe('createAuth (task 2.1)', () => {
  it('always puts the Turnstile check first, also when extensions bring plugins (task 2.9)', () => {
    expect(createAuth(prisma, env).options.plugins.map((p) => p.id)).toEqual([
      'guesshive-turnstile',
    ]);
    const extra = { id: 'extra' };
    const ids = createAuth(prisma, env, { plugins: [extra] }).options.plugins.map((p) => p.id);
    expect(ids).toEqual(['guesshive-turnstile', 'extra']);
  });

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
