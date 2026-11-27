import { USERNAME_PATTERN, normalizeUsername } from '@guesshive/shared';
import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_COUNTRY,
  PLACEHOLDER_LOCALE,
  PLACEHOLDER_TIMEZONE,
  PLACEHOLDER_USERNAME_PREFIX,
  localeFromAcceptLanguage,
  placeholderProfile,
  placeholderUsername,
} from './placeholder-profile.js';

describe('placeholderUsername (task 2.1)', () => {
  it('is bij_ plus 10 characters without look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const name = placeholderUsername();
      expect(name).toMatch(/^bij_[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
      expect(name.startsWith(PLACEHOLDER_USERNAME_PREFIX)).toBe(true);
    }
  });

  it('matches USERNAME_PATTERN and fits the 32-character column', () => {
    for (let i = 0; i < 200; i++) {
      const name = placeholderUsername();
      expect(USERNAME_PATTERN.test(name)).toBe(true);
      expect(name.length).toBeLessThanOrEqual(32);
    }
  });

  it('never uses 0, o, 1, i or l in the random part', () => {
    const random = Array.from({ length: 200 }, () =>
      placeholderUsername().slice(PLACEHOLDER_USERNAME_PREFIX.length),
    ).join('');
    expect(random).not.toMatch(/[0o1il]/);
  });

  it('gives a different name on every call', () => {
    const names = new Set(Array.from({ length: 500 }, () => placeholderUsername()));
    expect(names.size).toBe(500);
  });
});

describe('localeFromAcceptLanguage (task 2.1)', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace only', '   '],
    ['a wildcard', '*'],
    ['garbage', ';;,,=q'],
  ])('falls back to nl for %s', (_label, header) => {
    expect(localeFromAcceptLanguage(header)).toBe('nl');
    expect(PLACEHOLDER_LOCALE).toBe('nl');
  });

  it.each([
    ['en', 'en'],
    ['nl', 'nl'],
    ['EN', 'en'],
    ['en-GB', 'en'],
    ['en-GB,en;q=0.9', 'en'],
    ['nl-BE', 'nl'],
    ['nl-NL,nl;q=0.9,en;q=0.8', 'nl'],
    [' en-US ; q=0.8 ', 'en'],
  ])('reads %j as %s', (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });

  it('ranks by quality, not by position', () => {
    expect(localeFromAcceptLanguage('nl;q=0.5,en;q=0.9')).toBe('en');
    expect(localeFromAcceptLanguage('en;q=0.4, nl-BE;q=0.8')).toBe('nl');
  });

  it('keeps header order between equal qualities', () => {
    expect(localeFromAcceptLanguage('en,nl')).toBe('en');
    expect(localeFromAcceptLanguage('nl,en')).toBe('nl');
    expect(localeFromAcceptLanguage('en;q=0.7,nl;q=0.7')).toBe('en');
  });

  it('skips unsupported languages', () => {
    expect(localeFromAcceptLanguage('de-DE,fr;q=0.9,en;q=0.5')).toBe('en');
    expect(localeFromAcceptLanguage('de,fr')).toBe('nl');
  });

  it('ignores languages with q=0 (explicitly not wanted)', () => {
    expect(localeFromAcceptLanguage('en;q=0,nl;q=0.1')).toBe('nl');
    expect(localeFromAcceptLanguage('nl;q=0,en;q=0.1')).toBe('en');
    expect(localeFromAcceptLanguage('en;q=0')).toBe('nl');
    expect(localeFromAcceptLanguage('en;q=0.000')).toBe('nl');
  });

  it('ignores entries with an unparsable quality', () => {
    expect(localeFromAcceptLanguage('en;q=abc,nl;q=0.2')).toBe('nl');
  });
});

describe('placeholderProfile (task 2.1)', () => {
  it('builds the temporary profile in Better Auth field names', () => {
    const profile = placeholderProfile('en-GB,en;q=0.9');
    expect(profile).toEqual({
      name: expect.stringMatching(/^bij_[a-z2-9]{10}$/) as unknown,
      username: profile.name,
      image: null,
      countryCode: PLACEHOLDER_COUNTRY,
      locale: 'en',
      timezone: PLACEHOLDER_TIMEZONE,
    });
    expect(PLACEHOLDER_COUNTRY).toBe('NL');
    expect(PLACEHOLDER_TIMEZONE).toBe('Europe/Amsterdam');
  });

  it('stores username as the normalized (lowercase) displayUsername', () => {
    const profile = placeholderProfile(undefined);
    expect(profile.username).toBe(normalizeUsername(profile.name));
    expect(profile.username).toBe(profile.name.toLowerCase());
    expect(USERNAME_PATTERN.test(profile.name)).toBe(true);
  });

  it('defaults the locale to nl without an Accept-Language header', () => {
    expect(placeholderProfile(null).locale).toBe('nl');
  });

  it('gives each new account its own username', () => {
    expect(placeholderProfile(null).name).not.toBe(placeholderProfile(null).name);
  });
});
