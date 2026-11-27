import { randomInt } from 'node:crypto';
import { type Locale, SUPPORTED_LOCALES, normalizeUsername } from '@guesshive/shared';

/** Prefix of the temporary username every new account gets until onboarding (owner, 2026-11-27). */
export const PLACEHOLDER_USERNAME_PREFIX = 'bij_';
/** Random part: lowercase letters and digits without look-alikes (`0 o 1 i l`, as in ADR 0004). */
const PLACEHOLDER_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PLACEHOLDER_RANDOM_LENGTH = 10;

/** Fallbacks until onboarding (task 2.11) asks the user (owner, 2026-11-27). */
export const PLACEHOLDER_COUNTRY = 'NL';
export const PLACEHOLDER_LOCALE: Locale = 'nl';
export const PLACEHOLDER_TIMEZONE = 'Europe/Amsterdam';

/**
 * A temporary username such as `bij_k3x9mavq2p`. It matches USERNAME_PATTERN and 31^10 values
 * make a clash practically impossible; the unique index still guards it.
 */
export function placeholderUsername(): string {
  const random = Array.from({ length: PLACEHOLDER_RANDOM_LENGTH }, () =>
    PLACEHOLDER_ALPHABET.charAt(randomInt(PLACEHOLDER_ALPHABET.length)),
  ).join('');
  return `${PLACEHOLDER_USERNAME_PREFIX}${random}`;
}

/**
 * The first supported UI locale in an Accept-Language header (quality order), else the
 * fallback. The web app sends its UI language there (phase 3).
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) {
    return PLACEHOLDER_LOCALE;
  }
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { language: tag.split('-')[0]?.toLowerCase() ?? '', quality, index };
    })
    .filter((entry) => Number.isFinite(entry.quality) && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  const match = ranked.find((entry) =>
    (SUPPORTED_LOCALES as readonly string[]).includes(entry.language),
  );
  return (match?.language as Locale | undefined) ?? PLACEHOLDER_LOCALE;
}

/** Profile columns a new account starts with, in Better Auth field names (`name` = displayUsername). */
export interface PlaceholderProfile {
  name: string;
  username: string;
  image: null;
  countryCode: string;
  locale: Locale;
  timezone: string;
}

/**
 * The temporary profile of a new account (owner decision 2026-11-27). Whatever a provider sent as
 * name or photo is replaced: a real name never becomes the username and provider photos are never
 * used. The country comes from the IP country once the proxy forwards it (task 3.4); until then
 * NL.
 */
export function placeholderProfile(acceptLanguage: string | null | undefined): PlaceholderProfile {
  const displayUsername = placeholderUsername();
  return {
    name: displayUsername,
    username: normalizeUsername(displayUsername),
    image: null,
    countryCode: PLACEHOLDER_COUNTRY,
    locale: localeFromAcceptLanguage(acceptLanguage),
    timezone: PLACEHOLDER_TIMEZONE,
  };
}
