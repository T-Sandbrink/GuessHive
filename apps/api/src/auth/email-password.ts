import { type Locale, localeSchema } from '@guesshive/shared';
import type { AuthExtensions } from './auth.config.js';
import type { MailService } from '../mail/mail.service.js';
import {
  RESET_LINK_TTL_SECONDS,
  resetPasswordMessage,
  VERIFY_LINK_TTL_SECONDS,
  verifyEmailMessage,
} from '../mail/templates.js';
import { PLACEHOLDER_LOCALE } from './placeholder-profile.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH_FLOOR } from './password-policy.js';

/**
 * Whether signing in waits for a confirmed email address. Built with option A of the open
 * question "E-mail bevestigen vóór inloggen?" (PLAN.md): sign in at once, confirm later.
 */
export const REQUIRE_EMAIL_VERIFICATION = false;

/** The recipient's UI language from their profile, else the fallback. */
function localeOf(user: Record<string, unknown>): Locale {
  const parsed = localeSchema.safeParse(user['locale']);
  return parsed.success ? parsed.data : PLACEHOLDER_LOCALE;
}

/**
 * Email + password sign-in (task 2.2): sign-up, sign-in, email verification and password reset.
 * Mails go out in the background, so a reset request answers alike for known and unknown
 * addresses. With option A (sign in at once), sign-up does reveal an existing address
 * (`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`); that trade-off is part of the open owner question.
 */
export function emailPasswordMethod(mail: Pick<MailService, 'sendInBackground'>): AuthExtensions {
  return {
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH_FLOOR,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
      autoSignIn: true,
      // A reset signs out every other device, in case the password was stolen.
      revokeSessionsOnPasswordReset: true,
      // The reset mail promises this lifetime.
      resetPasswordTokenExpiresIn: RESET_LINK_TTL_SECONDS,
      sendResetPassword: ({ user, url }) => {
        mail.sendInBackground(resetPasswordMessage(user.email, localeOf(user), url));
        return Promise.resolve();
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: VERIFY_LINK_TTL_SECONDS,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => {
        mail.sendInBackground(verifyEmailMessage(user.email, localeOf(user), url));
        return Promise.resolve();
      },
    },
  };
}
