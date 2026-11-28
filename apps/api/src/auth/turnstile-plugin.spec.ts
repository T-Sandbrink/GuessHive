import { magicLink } from 'better-auth/plugins';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuth, defaultTurnstileVerifier } from './auth.config.js';
import {
  TURNSTILE_HEADER,
  TURNSTILE_SITEVERIFY_URL,
  TURNSTILE_TOKEN_MAX_LENGTH,
  type TurnstileResult,
  type TurnstileVerifier,
} from './turnstile.js';

const ORIGIN = 'http://localhost:5173';
const PRODUCTION_SECRET = '0x4AAAAAAAproductionTurnstileSecret';
const env = {
  NODE_ENV: 'development',
  BETTER_AUTH_SECRET: 'development-only-better-auth-secret-not-for-production',
  BETTER_AUTH_URL: ORIGIN,
  TURNSTILE_SECRET_KEY: PRODUCTION_SECRET,
} as ApiEnv;

/**
 * Any query fails the test loudly: every request here must be stopped by the Turnstile hook
 * before Better Auth reads or writes a table. (Adapter metadata reads are allowed.)
 */
const MODEL_DELEGATES = new Set(['user', 'account', 'session', 'verification', '$transaction']);
const prisma = new Proxy({} as PrismaClient, {
  get: (_target, prop) => {
    if (typeof prop === 'string' && MODEL_DELEGATES.has(prop)) {
      throw new Error(`database touched: ${prop}`);
    }
    return undefined;
  },
});

const SECRET_TOKEN = 'secret-turnstile-token-value-0123456789';

function setup(
  answer: TurnstileVerifier = () => Promise.resolve({ ok: false, reason: 'rejected' }),
) {
  const verify = vi.fn<TurnstileVerifier>(answer);
  const sendMagicLink = vi.fn(() => Promise.resolve());
  const auth = createAuth(
    prisma,
    env,
    { emailAndPassword: { enabled: true }, plugins: [magicLink({ sendMagicLink })] },
    verify,
  );
  return { auth, verify, sendMagicLink };
}

function post(path: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

const SIGN_UP = {
  path: '/sign-up/email',
  body: { email: 'jan@guesshive.test', password: 'correct-horse-battery-staple', name: 'Jan' },
  action: 'sign-up',
} as const;
const MAGIC_LINK = {
  path: '/sign-in/magic-link',
  body: { email: 'jan@guesshive.test' },
  action: 'magic-link',
} as const;

async function codeOf(res: Response): Promise<unknown> {
  const body = (await res.json()) as { code?: unknown };
  return body.code;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The plugin's hook as Better Auth runs it, through createAuth(...).handler (task 2.9). The
// magic-link endpoint comes from Better Auth's own plugin here, so its path is covered too.
describe.each([SIGN_UP, MAGIC_LINK])('Turnstile hook on $path (task 2.9)', (endpoint) => {
  it('refuses a request without a token with 400 TURNSTILE_REQUIRED, before anything else', async () => {
    const { auth, verify, sendMagicLink } = setup();
    const res = await auth.handler(post(endpoint.path, endpoint.body));
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('TURNSTILE_REQUIRED');
    expect(verify).not.toHaveBeenCalled();
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace before verifying, with the endpoint action', async () => {
    const { auth, verify } = setup();
    const res = await auth.handler(
      post(endpoint.path, endpoint.body, { [TURNSTILE_HEADER]: `  ${SECRET_TOKEN}\t ` }),
    );
    expect(res.status).toBe(403);
    expect(verify).toHaveBeenCalledExactlyOnceWith(SECRET_TOKEN, endpoint.action);
  });

  it('accepts a token of exactly the maximum length and refuses one longer unchecked', async () => {
    const { auth, verify } = setup();
    await auth.handler(
      post(endpoint.path, endpoint.body, {
        [TURNSTILE_HEADER]: 'x'.repeat(TURNSTILE_TOKEN_MAX_LENGTH),
      }),
    );
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockClear();
    const res = await auth.handler(
      post(endpoint.path, endpoint.body, {
        [TURNSTILE_HEADER]: 'x'.repeat(TURNSTILE_TOKEN_MAX_LENGTH + 1),
      }),
    );
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('TURNSTILE_FAILED');
    expect(verify).not.toHaveBeenCalled();
  });

  it.each<[TurnstileResult, number, string]>([
    [{ ok: false, reason: 'rejected' }, 403, 'TURNSTILE_FAILED'],
    [{ ok: false, reason: 'hostname_mismatch' }, 403, 'TURNSTILE_FAILED'],
    [{ ok: false, reason: 'action_mismatch' }, 403, 'TURNSTILE_FAILED'],
    [{ ok: false, reason: 'unavailable' }, 503, 'SERVICE_UNAVAILABLE'],
  ])('maps %j to %i %s and sends no magic link', async (result, status, code) => {
    const { auth, sendMagicLink } = setup(() => Promise.resolve(result));
    const res = await auth.handler(
      post(endpoint.path, endpoint.body, { [TURNSTILE_HEADER]: SECRET_TOKEN }),
    );
    expect(res.status).toBe(status);
    expect(await codeOf(res)).toBe(code);
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it('logs the action and reason on failure, never the token or the email', async () => {
    const { auth } = setup(() => Promise.resolve({ ok: false, reason: 'hostname_mismatch' }));
    const context = await auth.$context;
    const warn = vi.spyOn(context.logger, 'warn');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    await auth.handler(post(endpoint.path, endpoint.body, { [TURNSTILE_HEADER]: SECRET_TOKEN }));
    expect(warn).toHaveBeenCalledWith(
      `Turnstile verification failed (${endpoint.action}: hostname_mismatch)`,
    );
    const logged = JSON.stringify([
      warn.mock.calls,
      ...consoleSpies.map((spy) => spy.mock.calls as unknown),
    ]);
    expect(logged).not.toContain(SECRET_TOKEN);
    expect(logged).not.toContain(endpoint.body.email);
  });

  it('never echoes the token in the response', async () => {
    const { auth } = setup();
    const res = await auth.handler(
      post(endpoint.path, endpoint.body, { [TURNSTILE_HEADER]: SECRET_TOKEN }),
    );
    expect(await res.text()).not.toContain(SECRET_TOKEN);
  });

  it('fails closed with 503 when the verifier itself throws: no magic link, no token leak', async () => {
    const { auth, sendMagicLink } = setup(() => Promise.reject(new Error(SECRET_TOKEN)));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await auth.handler(
      post(endpoint.path, endpoint.body, { [TURNSTILE_HEADER]: SECRET_TOKEN }),
    );
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain(SECRET_TOKEN);
    expect(JSON.parse(text)).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(sendMagicLink).not.toHaveBeenCalled();
  });
});

describe('Turnstile hook scope (task 2.9)', () => {
  it('does not ask for a token on the magic-link verify endpoint', async () => {
    const { auth, verify } = setup();
    const res = await auth.handler(
      new Request(`${ORIGIN}/api/auth/magic-link/verify?token=nope`, {
        headers: { Origin: ORIGIN },
      }),
    );
    expect(res.status).not.toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('defaultTurnstileVerifier (task 2.9)', () => {
  function stubCloudflare(answer: Record<string, unknown>) {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(answer), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchFn);
    return fetchFn;
  }

  it('expects the hostname of BETTER_AUTH_URL, without port or path', async () => {
    const fetchFn = stubCloudflare({ success: true, hostname: 'guesshive.com', action: 'sign-up' });
    const verify = defaultTurnstileVerifier({
      ...env,
      BETTER_AUTH_URL: 'https://guesshive.com:8443/some/path',
    });
    await expect(verify('t', 'sign-up')).resolves.toEqual({ ok: true });
    expect(fetchFn.mock.calls[0]?.[0]).toBe(TURNSTILE_SITEVERIFY_URL);
  });

  it('refuses a token solved on another hostname than BETTER_AUTH_URL', async () => {
    stubCloudflare({ success: true, hostname: 'localhost', action: 'sign-up' });
    const verify = defaultTurnstileVerifier({ ...env, BETTER_AUTH_URL: 'https://guesshive.com' });
    await expect(verify('t', 'sign-up')).resolves.toEqual({
      ok: false,
      reason: 'hostname_mismatch',
    });
  });

  it('sends the configured secret key', async () => {
    const fetchFn = stubCloudflare({ success: true, hostname: 'localhost', action: 'sign-up' });
    await defaultTurnstileVerifier(env)('t', 'sign-up');
    const init = fetchFn.mock.calls[0]?.[1];
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    expect(body.get('secret')).toBe(PRODUCTION_SECRET);
  });
});
