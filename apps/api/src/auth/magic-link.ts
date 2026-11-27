import type { Locale } from '@guesshive/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { type MagicLinkOptions, magicLink } from 'better-auth/plugins/magic-link';
import type { MailService } from '../mail/mail.service.js';
import { MAGIC_LINK_TTL_SECONDS, magicLinkMessage } from '../mail/templates.js';
import { localeFromAcceptLanguage, localeOf } from './placeholder-profile.js';

/** The endpoint context Better Auth hands to sendMagicLink. */
type MagicLinkContext = Parameters<MagicLinkOptions['sendMagicLink']>[1];

/**
 * The language of the sign-in mail: the profile language of an existing account, else the
 * request's UI language (Accept-Language), the same one a new account will get. Both branches
 * do one lookup, so the answer takes as long for known and unknown addresses.
 */
export async function magicLinkLocale(email: string, ctx: MagicLinkContext): Promise<Locale> {
  const found = await ctx?.context.internalAdapter.findUserByEmail(email);
  if (found?.user) {
    return localeOf(found.user);
  }
  return localeFromAcceptLanguage(ctx?.headers?.get('accept-language'));
}

/** Body fields of `/sign-in/magic-link` that GuessHive does not use; a request with them is refused. */
export const MAGIC_LINK_UNUSED_FIELDS = ['name', 'metadata'] as const;

/**
 * Better Auth `hooks.before` for the magic-link endpoints (security review 2.3):
 * - `/sign-in/magic-link` refuses `name` and `metadata`. Better Auth would keep the name in the
 *   pending `Verification` row (the create hook drops it later anyway); a hook cannot remove a
 *   body field, because Better Auth merges hook output into the request.
 * - `/magic-link/verify` requires a `callbackURL`. Without one Better Auth answers with the
 *   session token in a JSON body that scripts can read, which would undo HttpOnly. Every link we
 *   mail carries one.
 */
export const magicLinkRequestPolicy = createAuthMiddleware((ctx) => {
  if (ctx.path === '/sign-in/magic-link') {
    const body: unknown = ctx.body;
    const record =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    if (MAGIC_LINK_UNUSED_FIELDS.some((field) => record[field] !== undefined)) {
      throw new APIError('BAD_REQUEST', {
        code: 'MAGIC_LINK_FIELD_NOT_ALLOWED',
        message: 'Unsupported field',
      });
    }
  } else if (ctx.path === '/magic-link/verify') {
    const callbackURL: unknown = ctx.query?.['callbackURL'];
    if (typeof callbackURL !== 'string' || callbackURL === '') {
      throw new APIError('BAD_REQUEST', {
        code: 'CALLBACK_URL_REQUIRED',
        message: 'callbackURL is required',
      });
    }
  }
  return Promise.resolve();
});

/**
 * Magic link via email (task 2.3): `POST /api/auth/sign-in/magic-link` mails a one-time link,
 * `GET /api/auth/magic-link/verify` signs in. An unknown address gets a new, already verified
 * account with the temporary profile (owner decision 2026-11-27), created on the verify request
 * (so its locale comes from that request's Accept-Language). An existing account whose address
 * was unconfirmed is promoted by Better Auth, which first revokes the unproven password and
 * sessions (protection against pre-registration takeover). The answer is the same for known and
 * unknown addresses, and the mail goes out in the background.
 */
export function magicLinkPlugin(mail: Pick<MailService, 'sendInBackground'>) {
  const plugin = magicLink({
    expiresIn: MAGIC_LINK_TTL_SECONDS,
    // A database read cannot use a pending link.
    storeToken: 'hashed',
    sendMagicLink: async ({ email, url }, ctx) => {
      const locale = await magicLinkLocale(email, ctx);
      mail.sendInBackground(magicLinkMessage(email, locale, url));
    },
  });
  return {
    ...plugin,
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) =>
            ctx.path === '/sign-in/magic-link' || ctx.path === '/magic-link/verify',
          handler: magicLinkRequestPolicy,
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
