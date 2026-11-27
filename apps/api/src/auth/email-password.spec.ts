import { describe, expect, it, vi } from 'vitest';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import {
  RESET_LINK_TTL_SECONDS,
  VERIFY_LINK_TTL_SECONDS,
  resetPasswordMessage,
  verifyEmailMessage,
} from '../mail/templates.js';
import { REQUIRE_EMAIL_VERIFICATION, emailPasswordMethod } from './email-password.js';

const URL = 'http://localhost:5173/api/auth/verify-email?token=abc';

function setup() {
  const sendInBackground = vi.fn<(message: MailMessage) => void>();
  const mail = { sendInBackground } as unknown as Pick<MailService, 'sendInBackground'>;
  return { sendInBackground, method: emailPasswordMethod(mail) };
}

/** A Better Auth user as the callbacks receive it. */
function user(extra: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'jan@example.test',
    emailVerified: false,
    name: 'bij_abcdefghjk',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  };
}

type Callback = (data: { user: ReturnType<typeof user>; url: string; token: string }) => unknown;

describe('emailPasswordMethod (task 2.2)', () => {
  it('enables email + password with the agreed options', () => {
    const { emailAndPassword, emailVerification } = setup().method;
    expect(emailAndPassword).toMatchObject({
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_LINK_TTL_SECONDS,
    });
    expect(REQUIRE_EMAIL_VERIFICATION).toBe(false);
    expect(emailVerification).toMatchObject({
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFY_LINK_TTL_SECONDS,
    });
    expect(RESET_LINK_TTL_SECONDS).toBe(3600);
    expect(VERIFY_LINK_TTL_SECONDS).toBe(3600);
  });

  it('only sets sign-in method keys, no plugins or providers', () => {
    expect(Object.keys(setup().method).sort()).toEqual(['emailAndPassword', 'emailVerification']);
  });

  it.each([
    ['nl', 'nl'],
    ['en', 'en'],
    ['an unsupported locale', 'de', 'nl'],
    ['a missing locale', undefined, 'nl'],
    ['a non-string locale', 42, 'nl'],
  ] as const)(
    'sends the verification mail in the user locale (%s)',
    async (_label, locale, expected = locale) => {
      const { sendInBackground, method } = setup();
      const send = method.emailVerification?.sendVerificationEmail as unknown as Callback;
      await send({ user: user({ locale }), url: URL, token: 'abc' });
      expect(sendInBackground).toHaveBeenCalledTimes(1);
      expect(sendInBackground).toHaveBeenCalledWith(
        verifyEmailMessage('jan@example.test', expected as 'nl' | 'en', URL),
      );
    },
  );

  it.each([
    ['nl', 'nl'],
    ['en', 'en'],
    ['an unsupported locale', 'fr', 'nl'],
    ['a missing locale', undefined, 'nl'],
  ] as const)(
    'sends the reset mail in the user locale (%s)',
    async (_label, locale, expected = locale) => {
      const { sendInBackground, method } = setup();
      const send = method.emailAndPassword?.sendResetPassword as unknown as Callback;
      await send({ user: user({ locale }), url: URL, token: 'abc' });
      expect(sendInBackground).toHaveBeenCalledTimes(1);
      expect(sendInBackground).toHaveBeenCalledWith(
        resetPasswordMessage('jan@example.test', expected as 'nl' | 'en', URL),
      );
    },
  );

  it('resolves at once, without waiting for the mail', async () => {
    const { sendInBackground, method } = setup();
    sendInBackground.mockImplementation(() => {
      // A provider that never answers must not hold up the request.
    });
    const verify = method.emailVerification?.sendVerificationEmail as unknown as Callback;
    const reset = method.emailAndPassword?.sendResetPassword as unknown as Callback;
    await expect(verify({ user: user(), url: URL, token: 't' })).resolves.toBeUndefined();
    await expect(reset({ user: user(), url: URL, token: 't' })).resolves.toBeUndefined();
  });
});
