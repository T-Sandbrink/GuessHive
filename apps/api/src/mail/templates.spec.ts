import { SUPPORTED_LOCALES } from '@guesshive/shared';
import { describe, expect, it } from 'vitest';
import {
  MAGIC_LINK_TTL_SECONDS,
  RESET_LINK_TTL_SECONDS,
  VERIFY_LINK_TTL_SECONDS,
  escapeHtml,
  magicLinkMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from './templates.js';

const TO = 'jan@example.test';
const URL_PLAIN = 'https://guesshive.test/api/auth/verify-email?token=abc&callbackURL=%2Fnl';
/** A link with every character that must be escaped in HTML. */
const URL_NASTY = `https://guesshive.test/x?a="1"&b=<script>alert('x')</script>`;

const TEMPLATES = [
  ['verifyEmailMessage', verifyEmailMessage],
  ['resetPasswordMessage', resetPasswordMessage],
  ['magicLinkMessage', magicLinkMessage],
] as const;

describe('escapeHtml (task 2.2)', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes & first, so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves other text unchanged', () => {
    expect(escapeHtml('Zoemende groet, GuessHive!')).toBe('Zoemende groet, GuessHive!');
  });
});

describe('mail templates (task 2.2)', () => {
  it.each([
    ['nl', 'Bevestig je e-mailadres voor GuessHive', 'E-mailadres bevestigen'],
    ['en', 'Confirm your email address for GuessHive', 'Confirm email address'],
  ] as const)('verifyEmailMessage in %s', (locale, subject, button) => {
    const message = verifyEmailMessage(TO, locale, URL_PLAIN);
    expect(message.to).toBe(TO);
    expect(message.subject).toBe(subject);
    expect(message.text).toContain(`${button}: ${URL_PLAIN}`);
    expect(message.html).toContain(button);
  });

  it.each([
    ['nl', 'Kies een nieuw wachtwoord voor GuessHive', 'Nieuw wachtwoord kiezen'],
    ['en', 'Choose a new GuessHive password', 'Choose a new password'],
  ] as const)('resetPasswordMessage in %s', (locale, subject, button) => {
    const message = resetPasswordMessage(TO, locale, URL_PLAIN);
    expect(message.to).toBe(TO);
    expect(message.subject).toBe(subject);
    expect(message.text).toContain(`${button}: ${URL_PLAIN}`);
    expect(message.html).toContain(button);
  });

  it.each(TEMPLATES)('%s has different copy per locale', (_name, template) => {
    const nl = template(TO, 'nl', URL_PLAIN);
    const en = template(TO, 'en', URL_PLAIN);
    expect(nl.subject).not.toBe(en.subject);
    expect(nl.text).not.toBe(en.text);
    expect(nl.html).not.toBe(en.html);
  });

  it.each(TEMPLATES)('%s exists for every supported locale', (_name, template) => {
    for (const locale of SUPPORTED_LOCALES) {
      const message = template(TO, locale, URL_PLAIN);
      expect(message.subject.length).toBeGreaterThan(0);
      expect(message.text.length).toBeGreaterThan(0);
    }
  });

  it.each(TEMPLATES)('%s puts the link in the text and as an escaped href', (_name, template) => {
    const message = template(TO, 'nl', URL_PLAIN);
    expect(message.text).toContain(URL_PLAIN);
    const escaped = URL_PLAIN.replaceAll('&', '&amp;');
    // The button and the visible fallback link both point at it.
    expect(message.html.split(`href="${escaped}"`)).toHaveLength(3);
    expect(message.html).toContain(`>${escaped}</a>`);
  });

  it.each(TEMPLATES)('%s escapes a link with " < > & and \' in the html', (_name, template) => {
    const message = template(TO, 'en', URL_NASTY);
    // Plain text keeps the link as-is (no HTML there).
    expect(message.text).toContain(URL_NASTY);
    const escaped = escapeHtml(URL_NASTY);
    expect(message.html.split(`href="${escaped}"`)).toHaveLength(3);
    // The visible fallback link text is escaped as well.
    expect(message.html).toContain(`>${escaped}</a>`);
    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain(`"1"`);
    expect(message.html).not.toContain(`'x'`);
    // Exactly two anchors (button + fallback): the attribute could not be broken out of.
    expect(message.html.match(/<a\s/g)).toHaveLength(2);
  });

  it.each(TEMPLATES)('%s escapes the copy itself in the html', (_name, template) => {
    const message = template(TO, 'en', URL_PLAIN);
    // The English copy contains apostrophes (didn't), which must be entity-escaped.
    expect(message.text).toMatch(/n't/);
    expect(message.html).toContain('&#39;');
    expect(message.html).not.toMatch(/n't/);
  });

  it.each(TEMPLATES)('%s never puts the recipient address in the body', (_name, template) => {
    const message = template(TO, 'nl', URL_PLAIN);
    expect(message.text).not.toContain(TO);
    expect(message.html).not.toContain(TO);
  });

  it.each(TEMPLATES)('%s produces a complete html document', (_name, template) => {
    const { html } = template(TO, 'nl', URL_PLAIN);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<meta name="color-scheme" content="light only">');
  });

  it.each(TEMPLATES)('%s sets the html lang and title per locale', (_name, template) => {
    for (const locale of ['nl', 'en'] as const) {
      const message = template(TO, locale, URL_PLAIN);
      expect(message.html).toContain(`<html lang="${locale}">`);
      expect(message.html).toContain(`<title>${escapeHtml(message.subject)}</title>`);
    }
  });

  it.each([
    ['nl', 'Werkt de knop niet? Kopieer dan deze link in je browser:'],
    ['en', 'Button not working? Copy this link into your browser:'],
  ] as const)('shows the fallback copy in %s in the html', (locale, fallback) => {
    for (const [, template] of TEMPLATES) {
      expect(template(TO, locale, URL_PLAIN).html).toContain(escapeHtml(fallback));
    }
  });

  it('promises one hour in the reset copy, matching the link lifetimes', () => {
    expect(RESET_LINK_TTL_SECONDS).toBe(3600);
    expect(VERIFY_LINK_TTL_SECONDS).toBe(3600);
    expect(resetPasswordMessage(TO, 'nl', URL_PLAIN).text).toContain('een uur');
    expect(resetPasswordMessage(TO, 'en', URL_PLAIN).text).toContain('one hour');
  });

  it.each([
    ['nl', 'Je inloglink voor GuessHive', 'Inloggen bij GuessHive'],
    ['en', 'Your GuessHive sign-in link', 'Sign in to GuessHive'],
  ] as const)('magicLinkMessage in %s (task 2.3)', (locale, subject, button) => {
    const message = magicLinkMessage(TO, locale, URL_PLAIN);
    expect(message.to).toBe(TO);
    expect(message.subject).toBe(subject);
    expect(message.text).toContain(`${button}: ${URL_PLAIN}`);
    expect(message.html).toContain(escapeHtml(button));
    expect(message.html).toContain(`<html lang="${locale}">`);
  });

  it('promises fifteen minutes and one use in the magic link copy, matching its lifetime (task 2.3)', () => {
    expect(MAGIC_LINK_TTL_SECONDS).toBe(15 * 60);
    const minutes = String(MAGIC_LINK_TTL_SECONDS / 60);
    const nl = magicLinkMessage(TO, 'nl', URL_PLAIN).text;
    const en = magicLinkMessage(TO, 'en', URL_PLAIN).text;
    expect(nl).toContain(`${minutes} minuten`);
    expect(nl).toContain('één keer');
    expect(en).toContain(`${minutes} minutes`);
    expect(en).toContain('works once');
  });

  it('says no password is needed in the magic link copy (task 2.3)', () => {
    expect(magicLinkMessage(TO, 'nl', URL_PLAIN).text).toContain('zonder wachtwoord');
    expect(magicLinkMessage(TO, 'en', URL_PLAIN).text).toContain('no password needed');
  });

  /** Every link lifetime the copy promises, in seconds ("15 minuten", "een uur", "2 hours"). */
  function promisedSeconds(text: string): number[] {
    const found: number[] = [];
    for (const m of text.matchAll(/(\d+)\s*(minuten|minutes|minuut|minute)\b/gi)) {
      found.push(Number(m[1]) * 60);
    }
    for (const m of text.matchAll(/(\d+|een|one|an)\s*(uur|hours?)\b/gi)) {
      const n = /^\d+$/.test(m[1] ?? '') ? Number(m[1]) : 1;
      found.push(n * 3600);
    }
    return found;
  }

  it.each([
    ['magicLinkMessage', magicLinkMessage, MAGIC_LINK_TTL_SECONDS],
    ['resetPasswordMessage', resetPasswordMessage, RESET_LINK_TTL_SECONDS],
  ] as const)(
    '%s promises exactly its configured lifetime in both locales',
    (_name, template, ttl) => {
      for (const locale of SUPPORTED_LOCALES) {
        const promised = promisedSeconds(template(TO, locale, URL_PLAIN).text);
        expect(promised, locale).toEqual([ttl]);
      }
    },
  );

  it('verifyEmailMessage promises no lifetime other than VERIFY_LINK_TTL_SECONDS', () => {
    // The verification copy does not mention a lifetime today; if it ever does, it must match.
    for (const locale of SUPPORTED_LOCALES) {
      for (const seconds of promisedSeconds(verifyEmailMessage(TO, locale, URL_PLAIN).text)) {
        expect(seconds, locale).toBe(VERIFY_LINK_TTL_SECONDS);
      }
    }
  });

  it('finds the lifetimes the copy is written in', () => {
    expect(promisedSeconds('De link is 15 minuten geldig.')).toEqual([900]);
    expect(promisedSeconds('The link works for one hour.')).toEqual([3600]);
    expect(promisedSeconds('Valid for 2 hours.')).toEqual([7200]);
    expect(promisedSeconds('No lifetime here.')).toEqual([]);
  });
});
