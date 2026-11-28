import type { ApiErrorCode } from '@guesshive/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { TURNSTILE_TEST_SECRETS } from './turnstile.constants.js';

/** Cloudflare's server-side verification endpoint for Turnstile tokens. */
export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Request header the web app sends the widget's token in. */
export const TURNSTILE_HEADER = 'x-turnstile-token';

/** Cloudflare's documented maximum token length; anything longer is refused unchecked. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

/**
 * Upper bound for one siteverify call. Without it, a hanging Cloudflare would hold the request
 * open; past it the request fails closed (503).
 */
export const TURNSTILE_TIMEOUT_MS = 5000;

/**
 * The Better Auth endpoints that need a Turnstile token (task 2.9), with the widget `action` the
 * web app sets for each. Matched on Better Auth's own endpoint path, after its routing, so a
 * request path in other casing or with `..` segments cannot slip past.
 */
export const TURNSTILE_PROTECTED_ENDPOINTS = {
  '/sign-up/email': 'sign-up',
  '/sign-in/magic-link': 'magic-link',
} as const satisfies Record<string, string>;

export type TurnstileAction =
  (typeof TURNSTILE_PROTECTED_ENDPOINTS)[keyof typeof TURNSTILE_PROTECTED_ENDPOINTS];

/** Outcome of one verification. `unavailable`: Cloudflare could not give an answer. */
export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: 'rejected' | 'hostname_mismatch' | 'action_mismatch' | 'unavailable' };

export type TurnstileVerifier = (
  token: string,
  action: TurnstileAction,
) => Promise<TurnstileResult>;

export interface TurnstileVerifierOptions {
  secretKey: string;
  /** The hostname the widget must have been solved on (the web origin's). */
  expectedHostname: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** The parts of a siteverify answer we read; everything else is ignored. */
interface SiteverifyAnswer {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
}

/**
 * Verifies a Turnstile token with Cloudflare. Sends only the secret and the token: never the
 * visitor's IP address (optional for Cloudflare, so left out; AGENTS.md §9 data minimisation).
 * Tokens are single-use; Cloudflare itself refuses a token that was already verified.
 */
export function createTurnstileVerifier(options: TurnstileVerifierOptions): TurnstileVerifier {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? TURNSTILE_TIMEOUT_MS;
  const isTestSecret = (TURNSTILE_TEST_SECRETS as readonly string[]).includes(options.secretKey);

  return async (token, action) => {
    let answer: SiteverifyAnswer;
    try {
      const response = await fetchFn(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: options.secretKey, response: token }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      if (!response.ok) {
        // Release the connection; the body is not needed.
        await response.body?.cancel().catch(() => undefined);
        return { ok: false, reason: 'unavailable' };
      }
      const parsed: unknown = await response.json();
      if (typeof parsed !== 'object' || parsed === null) {
        return { ok: false, reason: 'unavailable' };
      }
      answer = parsed;
    } catch {
      // Network error, timeout or a body that is not JSON: fail closed.
      return { ok: false, reason: 'unavailable' };
    }

    if (answer.success !== true) {
      return { ok: false, reason: 'rejected' };
    }
    if (!isTestSecret) {
      if (answer.hostname !== options.expectedHostname) {
        return { ok: false, reason: 'hostname_mismatch' };
      }
      if (answer.action !== action) {
        return { ok: false, reason: 'action_mismatch' };
      }
    }
    return { ok: true };
  };
}

/** The protected endpoint's action, or undefined when the path needs no token. */
export function turnstileActionFor(path: string | undefined): TurnstileAction | undefined {
  if (path === undefined || !Object.hasOwn(TURNSTILE_PROTECTED_ENDPOINTS, path)) {
    return undefined;
  }
  return TURNSTILE_PROTECTED_ENDPOINTS[path as keyof typeof TURNSTILE_PROTECTED_ENDPOINTS];
}

/**
 * Better Auth plugin (task 2.9): sign-up with email and password and the magic-link request need
 * a valid Cloudflare Turnstile token in the `x-turnstile-token` header, checked server-side
 * before the endpoint runs and before any other plugin's hooks (Better Auth runs a top-level
 * `hooks.before` earlier still; see the merge note for 2.2 in PLAN.md). No token: 400 `TURNSTILE_REQUIRED`. Refused by
 * Cloudflare (invalid, expired, reused, wrong hostname or action): 403 `TURNSTILE_FAILED`.
 * Cloudflare unreachable: 503 `SERVICE_UNAVAILABLE` (fail closed, like the auth rate limits when
 * Redis is down).
 */
export function turnstilePlugin(verify: TurnstileVerifier) {
  return {
    id: 'guesshive-turnstile',
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) => turnstileActionFor(ctx.path) !== undefined,
          handler: createAuthMiddleware(async (ctx) => {
            const action = turnstileActionFor(ctx.path);
            if (action === undefined) {
              return;
            }
            const token = ctx.headers?.get(TURNSTILE_HEADER)?.trim() ?? '';
            if (token === '') {
              throw new APIError('BAD_REQUEST', {
                code: 'TURNSTILE_REQUIRED' satisfies ApiErrorCode,
                message: 'Turnstile token required',
              });
            }
            const result: TurnstileResult =
              token.length > TURNSTILE_TOKEN_MAX_LENGTH
                ? { ok: false, reason: 'rejected' }
                : await verify(token, action).catch((): TurnstileResult => ({
                    ok: false,
                    reason: 'unavailable',
                  }));
            if (result.ok) {
              return;
            }
            // The action and reason only (in the message, as some loggers drop details), never
            // the token.
            ctx.context.logger.warn(`Turnstile verification failed (${action}: ${result.reason})`);
            if (result.reason === 'unavailable') {
              throw new APIError('SERVICE_UNAVAILABLE', {
                code: 'SERVICE_UNAVAILABLE' satisfies ApiErrorCode,
                message: 'Bot check unavailable',
              });
            }
            throw new APIError('FORBIDDEN', {
              code: 'TURNSTILE_FAILED' satisfies ApiErrorCode,
              message: 'Turnstile verification failed',
            });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
