import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { ApiEnv } from '../env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { placeholderProfile } from './placeholder-profile.js';
import { type TurnstileVerifier, createTurnstileVerifier, turnstilePlugin } from './turnstile.js';

/**
 * Where Better Auth lives, on the api and (through the SvelteKit proxy, which forwards this path
 * unchanged) on the public web origin: OAuth callbacks are `${BETTER_AUTH_URL}/api/auth/...`.
 */
export const AUTH_BASE_PATH = '/api/auth';

/** Cookie name prefix: `guesshive.session_token` (`__Secure-` in front over https). */
export const AUTH_COOKIE_PREFIX = 'guesshive';

/**
 * Better Auth endpoints we switch off (smaller attack surface). Profile changes go through our
 * own validated `/me` (task 2.12), so `/update-user` could otherwise bypass the username rules.
 * Session listing (it would hand other sessions' tokens to the browser), account linking and
 * provider-token endpoints stay off until their own tasks (2.6, 2.7) and the open question on
 * OAuth tokens. Changing email and deleting the account are off by default in Better Auth and
 * stay off until their own tasks (the 14-day grace period, task 11.2).
 */
export const DISABLED_AUTH_PATHS = [
  '/update-user',
  '/list-sessions',
  '/update-session',
  '/link-social',
  '/unlink-account',
  '/get-access-token',
  '/refresh-token',
  '/account-info',
];

/**
 * The parts of the configuration later tasks may add: sign-in methods (2.2–2.5) and plugins.
 * Everything else (cookies, hooks, privacy settings, disabled paths) is locked in authOptions,
 * so an extension cannot silently drop it.
 */
export type AuthExtensions = Pick<
  BetterAuthOptions,
  'emailAndPassword' | 'emailVerification' | 'socialProviders' | 'plugins'
>;

/**
 * Better Auth options for GuessHive (task 2.1, ADR 0006). Sign-in methods are added by their own
 * tasks (2.2–2.5) through `AuthExtensions`.
 */
export function authOptions(prisma: PrismaClient, env: ApiEnv) {
  return {
    appName: 'GuessHive',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: AUTH_BASE_PATH,
    // The web origin (BETTER_AUTH_URL) is trusted by default; nothing else is.
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    disabledPaths: DISABLED_AUTH_PATHS,
    // Our own Redis rate limits (RateLimitGuard, task 2.10) run on the auth controller instead.
    rateLimit: { enabled: false },
    // Sessions live only in Postgres (owner, 2026-11-27): no secondaryStorage, no cookie cache,
    // so signing out or revoking a session takes effect at once.
    session: { cookieCache: { enabled: false } },
    user: {
      fields: { name: 'displayUsername', image: 'avatarUrl' },
      additionalFields: {
        // Not `required`: Better Auth checks required fields before the create hook runs, and
        // the hook below always fills these four (the columns are NOT NULL as well).
        username: { type: 'string', required: false, input: false, returned: false },
        countryCode: { type: 'string', required: false, input: false, returned: false },
        locale: { type: 'string', required: false, input: false, returned: false },
        timezone: { type: 'string', required: false, input: false, returned: false },
        role: { type: 'string', required: false, input: false },
        status: { type: 'string', required: false, input: false },
      },
    },
    account: {
      // Linking another sign-in method never copies its name or photo onto the profile.
      accountLinking: { updateUserInfoOnLink: false },
    },
    databaseHooks: {
      user: {
        create: {
          // Every new account starts with a temporary profile until the mandatory onboarding
          // (owner, 2026-11-27), whatever the provider sent.
          before: (user, context) =>
            Promise.resolve({
              data: {
                ...user,
                ...placeholderProfile(context?.headers?.get('accept-language')),
              },
            }),
        },
        update: {
          // Better Auth merges each hook's returned data into the update, and this hook runs
          // after any plugin's, so its explicit `undefined`s win; the adapter skips undefined
          // values on update, so these columns stay unchanged.
          before: () =>
            Promise.resolve({ data: { name: undefined, image: undefined, username: undefined } }),
        },
      },
      session: {
        // Better Auth writes '' when IP tracking is off; store NULL so the CHECK on
        // Session.ipAddress holds and no IP is ever kept (AGENTS.md §9).
        create: {
          before: (session) => Promise.resolve({ data: { ...session, ipAddress: null } }),
        },
        update: {
          before: (session) =>
            Promise.resolve({
              data: 'ipAddress' in session ? { ...session, ipAddress: null } : session,
            }),
        },
      },
    },
    // Magic-link and reset tokens are stored hashed, so a database read cannot use them.
    verification: { storeIdentifier: 'hashed' },
    advanced: {
      // Postgres generates every id (uuidv7(), ADR 0004).
      database: { generateId: false },
      // Raw IP addresses are never stored (AGENTS.md §9); a CHECK keeps Session.ipAddress NULL.
      ipAddress: { disableIpTracking: true },
      cookiePrefix: AUTH_COOKIE_PREFIX,
      // Explicit, because Better Auth skips both checks when NODE_ENV=test or TEST is set.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: env.NODE_ENV === 'production',
    },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

/** The real Turnstile check against Cloudflare, for the web origin's hostname. */
export function defaultTurnstileVerifier(env: ApiEnv, fetchFn?: typeof fetch): TurnstileVerifier {
  return createTurnstileVerifier({
    secretKey: env.TURNSTILE_SECRET_KEY,
    // One host only: the widget must be served on the BETTER_AUTH_URL host (ADR 0006).
    expectedHostname: new URL(env.BETTER_AUTH_URL).hostname,
    fetchFn,
  });
}

/**
 * Creates the Better Auth instance with the sign-in methods and plugins in `extensions`. The
 * Turnstile check (task 2.9) is always first and cannot be left out; tests pass a fake verifier.
 */
export function createAuth(
  prisma: PrismaClient,
  env: ApiEnv,
  extensions: AuthExtensions = {},
  turnstile: TurnstileVerifier = defaultTurnstileVerifier(env),
) {
  // Only these four keys pass, even when the argument carries more at runtime.
  const { emailAndPassword, emailVerification, socialProviders, plugins } = extensions;
  return betterAuth({
    emailAndPassword,
    emailVerification,
    socialProviders,
    ...authOptions(prisma, env),
    // After the spread, so nothing in authOptions can replace the Turnstile plugin.
    plugins: [turnstilePlugin(turnstile), ...(plugins ?? [])],
  });
}

export type Auth = ReturnType<typeof createAuth>;
