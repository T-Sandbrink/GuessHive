import { describe, expect, it, vi } from 'vitest';
import {
  TURNSTILE_SITEVERIFY_URL,
  type TurnstileVerifierOptions,
  createTurnstileVerifier,
  turnstileActionFor,
  turnstilePlugin,
} from './turnstile.js';
import { TURNSTILE_DEV_SECRET } from './turnstile.constants.js';

const SECRET = '0x4AAAAAAAproductionTurnstileSecret';
const HOST = 'guesshive.example';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function verifierWith(
  answer: () => Promise<Response>,
  options: Partial<TurnstileVerifierOptions> = {},
) {
  const fetchFn = vi.fn<typeof fetch>(() => answer());
  const verify = createTurnstileVerifier({
    secretKey: SECRET,
    expectedHostname: HOST,
    fetchFn,
    ...options,
  });
  return { verify, fetchFn };
}

describe('createTurnstileVerifier (task 2.9)', () => {
  it('passes a successful answer for the right hostname and action', async () => {
    const { verify } = verifierWith(() =>
      Promise.resolve(jsonResponse({ success: true, hostname: HOST, action: 'sign-up' })),
    );
    await expect(verify('token', 'sign-up')).resolves.toEqual({ ok: true });
  });

  it('posts only the secret and the token (never an IP address), form-encoded', async () => {
    const { verify, fetchFn } = verifierWith(() =>
      Promise.resolve(jsonResponse({ success: true, hostname: HOST, action: 'magic-link' })),
    );
    await verify('the-token', 'magic-link');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    expect([...body.keys()].sort()).toEqual(['response', 'secret']);
    expect(body.get('secret')).toBe(SECRET);
    expect(body.get('response')).toBe('the-token');
  });

  it('rejects an answer Cloudflare marks as unsuccessful', async () => {
    const { verify } = verifierWith(() =>
      Promise.resolve(
        jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'], hostname: HOST }),
      ),
    );
    await expect(verify('token', 'sign-up')).resolves.toEqual({ ok: false, reason: 'rejected' });
  });

  it.each([{ success: 'true' }, { success: 1 }, {}])(
    'treats a non-boolean success %j as rejected',
    async (answer) => {
      const { verify } = verifierWith(() =>
        Promise.resolve(jsonResponse({ ...answer, hostname: HOST, action: 'sign-up' })),
      );
      await expect(verify('token', 'sign-up')).resolves.toEqual({
        ok: false,
        reason: 'rejected',
      });
    },
  );

  it('rejects a token solved on another hostname', async () => {
    const { verify } = verifierWith(() =>
      Promise.resolve(jsonResponse({ success: true, hostname: 'evil.example', action: 'sign-up' })),
    );
    await expect(verify('token', 'sign-up')).resolves.toEqual({
      ok: false,
      reason: 'hostname_mismatch',
    });
  });

  it('rejects a token solved for another action (a sign-up token on the magic-link request)', async () => {
    const { verify } = verifierWith(() =>
      Promise.resolve(jsonResponse({ success: true, hostname: HOST, action: 'sign-up' })),
    );
    await expect(verify('token', 'magic-link')).resolves.toEqual({
      ok: false,
      reason: 'action_mismatch',
    });
  });

  it('skips the hostname and action checks for a Cloudflare test secret only', async () => {
    const { verify } = verifierWith(
      () => Promise.resolve(jsonResponse({ success: true, hostname: 'example.com', action: '' })),
      { secretKey: TURNSTILE_DEV_SECRET },
    );
    await expect(verify('XXXX.DUMMY.TOKEN.XXXX', 'sign-up')).resolves.toEqual({ ok: true });
  });

  it.each([
    ['an HTTP error', () => Promise.resolve(new Response('oops', { status: 500 }))],
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['a JSON body that is not an object', () => Promise.resolve(jsonResponse(null))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
  ])('fails closed on %s', async (_label, answer) => {
    const { verify } = verifierWith(answer);
    await expect(verify('token', 'sign-up')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('fails closed when Cloudflare does not answer in time', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const verify = createTurnstileVerifier({
      secretKey: SECRET,
      expectedHostname: HOST,
      fetchFn,
      timeoutMs: 20,
    });
    await expect(verify('token', 'sign-up')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('turnstileActionFor (task 2.9)', () => {
  it('maps the protected endpoints to their widget action', () => {
    expect(turnstileActionFor('/sign-up/email')).toBe('sign-up');
    expect(turnstileActionFor('/sign-in/magic-link')).toBe('magic-link');
  });

  it.each([
    undefined,
    '/sign-in/email',
    '/magic-link/verify',
    '/sign-up/email/',
    '/Sign-Up/email',
    'toString',
    '__proto__',
    'constructor',
  ])('needs no token for %j', (path) => {
    expect(turnstileActionFor(path)).toBeUndefined();
  });
});

describe('turnstilePlugin (task 2.9)', () => {
  it('only matches the protected endpoints', () => {
    const [hook] = turnstilePlugin(() => Promise.resolve({ ok: true })).hooks.before;
    expect(hook?.matcher({ path: '/sign-up/email' })).toBe(true);
    expect(hook?.matcher({ path: '/sign-in/magic-link' })).toBe(true);
    expect(hook?.matcher({ path: '/sign-in/email' })).toBe(false);
    expect(hook?.matcher({ path: '/magic-link/verify' })).toBe(false);
    expect(hook?.matcher({})).toBe(false);
  });
});
