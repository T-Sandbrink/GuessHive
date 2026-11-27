import type { Locale } from '@guesshive/shared';
import type { MailMessage } from './mail.service.js';

/**
 * Email texts (task 2.2), in the UI language of the recipient. DRAFT: the owner approves the
 * wording (PLAN.md open question "Teksten van de e-mails").
 */
interface MailCopy {
  subject: string;
  greeting: string;
  body: string;
  button: string;
  fallback: string;
  ignore: string;
  signature: string;
}

/** How long a password-reset link works; email-password.ts configures Better Auth with it. */
export const RESET_LINK_TTL_SECONDS = 60 * 60;
/** How long an email-confirmation link works (open question on the email texts). */
export const VERIFY_LINK_TTL_SECONDS = 60 * 60;

const VERIFY_EMAIL: Record<Locale, MailCopy> = {
  nl: {
    subject: 'Bevestig je e-mailadres voor GuessHive',
    greeting: 'Hoi!',
    body: 'Fijn dat je er bent. Bevestig even je e-mailadres, dan weet de bij dat jij het echt bent.',
    button: 'E-mailadres bevestigen',
    fallback: 'Werkt de knop niet? Kopieer dan deze link in je browser:',
    ignore: 'Heb je geen account bij GuessHive gemaakt? Dan kun je deze mail negeren.',
    signature: 'Zoemende groet, GuessHive',
  },
  en: {
    subject: 'Confirm your email address for GuessHive',
    greeting: 'Hi!',
    body: "Great to have you! Confirm your email address so the bee knows it's really you.",
    button: 'Confirm email address',
    fallback: 'Button not working? Copy this link into your browser:',
    ignore: "If you didn't create a GuessHive account, you can ignore this email.",
    signature: 'Cheers from the hive, GuessHive',
  },
};

// The copy promises one hour; RESET_LINK_TTL_SECONDS keeps the config in step.
const RESET_PASSWORD: Record<Locale, MailCopy> = {
  nl: {
    subject: 'Kies een nieuw wachtwoord voor GuessHive',
    greeting: 'Hoi!',
    body: 'Je hebt een nieuw wachtwoord aangevraagd. Kies er een via de knop hieronder. De link is een uur geldig.',
    button: 'Nieuw wachtwoord kiezen',
    fallback: 'Werkt de knop niet? Kopieer dan deze link in je browser:',
    ignore:
      'Heb je dit niet gevraagd? Dan hoef je niets te doen: je wachtwoord blijft gewoon hetzelfde.',
    signature: 'Zoemende groet, GuessHive',
  },
  en: {
    subject: 'Choose a new GuessHive password',
    greeting: 'Hi!',
    body: 'Someone asked for a new password for your account. Use the button below to choose one. The link works for one hour.',
    button: 'Choose a new password',
    fallback: 'Button not working? Copy this link into your browser:',
    ignore: "Didn't ask for this? You can ignore this email. Your password won't change.",
    signature: 'Cheers from the hive, GuessHive',
  },
};

/** Escapes text for HTML element content and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const FONT = "Nunito, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function render(to: string, locale: Locale, copy: MailCopy, url: string): MailMessage {
  const text = [
    copy.greeting,
    '',
    copy.body,
    '',
    `${copy.button}: ${url}`,
    '',
    copy.ignore,
    '',
    copy.signature,
  ].join('\n');
  const link = escapeHtml(url);
  // A white card with light-only colour schemes, so dark-mode clients either keep it light or
  // invert all of it (never dark text on dark). The button is a one-cell table, which Outlook
  // also renders with its padding.
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background: #fff8e7;">
<div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; font-family: ${FONT}; color: #2b2116; line-height: 1.5; font-size: 16px;">
<p style="margin: 0 0 16px;">${escapeHtml(copy.greeting)}</p>
<p style="margin: 0 0 24px;">${escapeHtml(copy.body)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px;"><tr>
<td bgcolor="#f5b82e" style="border-radius: 999px; background: #f5b82e;"><a href="${link}" style="display: inline-block; padding: 12px 24px; color: #2b2116; text-decoration: none; font-weight: bold;">${escapeHtml(copy.button)}</a></td>
</tr></table>
<p style="margin: 0 0 4px; font-size: 14px; color: #6b5a45;">${escapeHtml(copy.fallback)}</p>
<p style="margin: 0 0 24px; font-size: 14px; word-break: break-all;"><a href="${link}" style="color: #2b2116;">${link}</a></p>
<p style="margin: 0 0 16px; font-size: 14px; color: #6b5a45;">${escapeHtml(copy.ignore)}</p>
<p style="margin: 0;">${escapeHtml(copy.signature)}</p>
</div>
</body>
</html>`;
  return { to, subject: copy.subject, text, html };
}

/** The email that confirms an address after sign-up. */
export function verifyEmailMessage(to: string, locale: Locale, url: string): MailMessage {
  return render(to, locale, VERIFY_EMAIL[locale], url);
}

/** The email with a link to choose a new password. */
export function resetPasswordMessage(to: string, locale: Locale, url: string): MailMessage {
  return render(to, locale, RESET_PASSWORD[locale], url);
}
