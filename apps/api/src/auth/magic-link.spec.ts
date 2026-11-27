import { describe, expect, it, vi } from 'vitest';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import { MAGIC_LINK_TTL_SECONDS, magicLinkMessage } from '../mail/templates.js';
import {
  MAGIC_LINK_UNUSED_FIELDS,
  magicLinkLocale,
  magicLinkPlugin,
  magicLinkRequestPolicy,
} from './magic-link.js';

const EMAIL = 'jan@example.test';
const URL = 'http://localhost:5173/api/auth/magic-link/verify?token=abc&callbackURL=%2F';

type Plugin = ReturnType<typeof magicLinkPlugin>;
type SendMagicLink = Plugin['options']['sendMagicLink'];
type Context = Parameters<SendMagicLink>[1];

/**
 * A minimal endpoint context: the user lookup Better Auth's internal adapter does, and the
 * request headers.
 */
function context(user: Record<string, unknown> | null, acceptLanguage?: string) {
  const findUserByEmail = vi.fn((_email: string) =>
    Promise.resolve(user === null ? null : { user, accounts: [] }),
  );
  const headers = new Headers(
    acceptLanguage === undefined ? {} : { 'accept-language': acceptLanguage },
  );
  const ctx = { context: { internalAdapter: { findUserByEmail } }, headers } as unknown as Context;
  return { ctx, findUserByEmail };
}

function setup() {
  const sendInBackground = vi.fn<(message: MailMessage) => void>();
  const mail = { sendInBackground } as unknown as Pick<MailService, 'sendInBackground'>;
  return { sendInBackground, plugin: magicLinkPlugin(mail) };
}

describe('magicLinkPlugin (task 2.3)', () => {
  it('is the Better Auth magic-link plugin', () => {
    const { plugin } = setup();
    expect(plugin.id).toBe('magic-link');
    expect(Object.keys(plugin.endpoints).sort()).toEqual(['magicLinkVerify', 'signInMagicLink']);
  });

  it('runs the request policy before both magic-link endpoints only', () => {
    const { plugin } = setup();
    const before = plugin.hooks.before;
    expect(before).toHaveLength(1);
    const [hook] = before;
    expect(hook?.handler).toBe(magicLinkRequestPolicy);
    for (const path of ['/sign-in/magic-link', '/magic-link/verify']) {
      expect(hook?.matcher({ path })).toBe(true);
    }
    for (const path of ['/sign-in/email', '/sign-up/email', '/get-session', '/verify-email']) {
      expect(hook?.matcher({ path })).toBe(false);
    }
    expect(hook?.matcher({})).toBe(false);
  });

  it('refuses exactly the name and metadata body fields', () => {
    expect([...MAGIC_LINK_UNUSED_FIELDS].sort()).toEqual(['metadata', 'name']);
  });

  it('lets a link live MAGIC_LINK_TTL_SECONDS (15 minutes) and stores the token hashed', () => {
    const { options } = setup().plugin;
    expect(MAGIC_LINK_TTL_SECONDS).toBe(15 * 60);
    expect(options.expiresIn).toBe(MAGIC_LINK_TTL_SECONDS);
    expect(options.storeToken).toBe('hashed');
  });

  it('keeps sign-up through a magic link on and single-use links (no extra attempts)', () => {
    const { options } = setup().plugin;
    expect(options.disableSignUp).toBeUndefined();
    expect(options.generateToken).toBeUndefined();
  });

  it.each([
    ['nl', 'nl', 'en-GB'],
    ['en', 'en', 'nl-NL'],
  ] as const)(
    'mails an existing user in their profile locale (%s), whatever the request says',
    async (_label, locale, acceptLanguage) => {
      const { sendInBackground, plugin } = setup();
      const { ctx, findUserByEmail } = context({ id: 'u1', email: EMAIL, locale }, acceptLanguage);
      await plugin.options.sendMagicLink({ email: EMAIL, url: URL, token: 'abc' }, ctx);
      expect(findUserByEmail).toHaveBeenCalledWith(EMAIL);
      expect(sendInBackground).toHaveBeenCalledTimes(1);
      expect(sendInBackground).toHaveBeenCalledWith(magicLinkMessage(EMAIL, locale, URL));
    },
  );

  it.each([
    ['en-GB,en;q=0.9', 'en'],
    ['nl-BE,nl;q=0.9', 'nl'],
    ['de-DE,en;q=0.5', 'en'],
    ['fr-FR', 'nl'],
  ] as const)(
    'mails an unknown address in the Accept-Language locale (%s -> %s)',
    async (acceptLanguage, expected) => {
      const { sendInBackground, plugin } = setup();
      const { ctx } = context(null, acceptLanguage);
      await plugin.options.sendMagicLink({ email: EMAIL, url: URL, token: 'abc' }, ctx);
      expect(sendInBackground).toHaveBeenCalledWith(magicLinkMessage(EMAIL, expected, URL));
    },
  );

  it('passes the url Better Auth built into the mail unchanged, to the requested address', async () => {
    const { sendInBackground, plugin } = setup();
    const { ctx } = context(null, 'en');
    await plugin.options.sendMagicLink({ email: EMAIL, url: URL, token: 'abc' }, ctx);
    const message = sendInBackground.mock.calls[0]?.[0];
    expect(message?.to).toBe(EMAIL);
    expect(message?.text).toContain(URL);
  });

  it('resolves at once, without waiting for the mail', async () => {
    const { sendInBackground, plugin } = setup();
    sendInBackground.mockImplementation(() => {
      // A provider that never answers must not hold up the request.
    });
    const { ctx } = context(null);
    await expect(
      plugin.options.sendMagicLink({ email: EMAIL, url: URL, token: 'abc' }, ctx),
    ).resolves.toBeUndefined();
  });

  it('lets a failing user lookup fail the request instead of mailing in a guessed locale', async () => {
    const { sendInBackground, plugin } = setup();
    const { ctx, findUserByEmail } = context(null);
    findUserByEmail.mockRejectedValueOnce(new Error('db down'));
    await expect(
      plugin.options.sendMagicLink({ email: EMAIL, url: URL, token: 'abc' }, ctx),
    ).rejects.toThrow('db down');
    expect(sendInBackground).not.toHaveBeenCalled();
  });
});

describe('magicLinkLocale (task 2.3)', () => {
  it.each([
    ['nl', 'nl'],
    ['en', 'en'],
    ['an unsupported locale', 'de', 'nl'],
    ['a missing locale', undefined, 'nl'],
    ['a non-string locale', 42, 'nl'],
  ] as const)(
    "takes an existing user's profile locale (%s)",
    async (_label, locale, expected = locale) => {
      // The request asks for English; the profile wins, also when it falls back.
      const { ctx } = context({ id: 'u1', email: EMAIL, locale }, 'en');
      await expect(magicLinkLocale(EMAIL, ctx)).resolves.toBe(expected);
    },
  );

  it('takes the Accept-Language locale for an unknown address', async () => {
    const { ctx } = context(null, 'en-US,en;q=0.9');
    await expect(magicLinkLocale(EMAIL, ctx)).resolves.toBe('en');
  });

  it("falls back to 'nl' for an unknown address without Accept-Language", async () => {
    const { ctx } = context(null);
    await expect(magicLinkLocale(EMAIL, ctx)).resolves.toBe('nl');
  });

  it("falls back to 'nl' without an endpoint context", async () => {
    await expect(magicLinkLocale(EMAIL, undefined as unknown as Context)).resolves.toBe('nl');
  });

  it('does exactly one user lookup for known and unknown addresses', async () => {
    const known = context({ id: 'u1', email: EMAIL, locale: 'en' });
    const unknown = context(null);
    await magicLinkLocale(EMAIL, known.ctx);
    await magicLinkLocale('nobody@example.test', unknown.ctx);
    expect(known.findUserByEmail).toHaveBeenCalledTimes(1);
    expect(unknown.findUserByEmail).toHaveBeenCalledTimes(1);
  });
});
