import { APP_SETTINGS } from '@guesshive/shared';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { SettingsService } from '../settings/settings.service.js';

/** Hard bounds of the minimum length (AppSetting `auth.passwordMinLength`, 8–64). */
export const PASSWORD_MIN_LENGTH_FLOOR = APP_SETTINGS['auth.passwordMinLength'].min;
/** Longest password accepted (Better Auth's default): long passphrases are welcome. */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Endpoints that set a password, with the body field that carries it. Server-only
 * `auth.api.setPassword` has no path and never passes this hook: a task that calls it must
 * check the length itself.
 */
export const PASSWORD_FIELDS: ReadonlyMap<string, string> = new Map([
  ['/sign-up/email', 'password'],
  ['/reset-password', 'newPassword'],
  ['/change-password', 'newPassword'],
]);

/** The settings the password policy reads. */
export type PasswordSettings = Pick<SettingsService, 'get'>;

/**
 * Better Auth `hooks.before` that forces `revokeOtherSessions` on `/change-password` and enforces the admin-set minimum password length (task 2.2,
 * `auth.passwordMinLength`, default 12). Better Auth's own minimum stays at the hard floor (8),
 * so a lower admin value can never undercut it; this hook adds the current setting on top.
 */
export function passwordPolicyHook(settings: PasswordSettings) {
  return createAuthMiddleware(async (ctx) => {
    const field = PASSWORD_FIELDS.get(ctx.path);
    if (field === undefined) {
      return;
    }
    const body: unknown = ctx.body;
    const password =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)[field]
        : undefined;
    if (typeof password !== 'string') {
      return;
    }
    const minLength = await settings.get('auth.passwordMinLength');
    if (password.length < minLength) {
      throw new APIError('BAD_REQUEST', {
        code: 'PASSWORD_TOO_SHORT',
        message: 'Password too short',
        minLength,
      });
    }
    // A password change always signs out every other device, whatever the client asked, so a
    // stolen session does not survive it (security review 2.2).
    if (ctx.path === '/change-password') {
      return {
        context: { body: { ...(body as Record<string, unknown>), revokeOtherSessions: true } },
      };
    }
    return undefined;
  });
}
