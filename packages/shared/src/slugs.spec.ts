import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, slugify } from './slugs.js';

describe('slugify', () => {
  it.each([
    ['Wie is de beste voetballer ooit?', 'wie-is-de-beste-voetballer-ooit'],
    ['Café of terras?', 'cafe-of-terras'],
    ['  Ajax -- PSV!!  ', 'ajax-psv'],
    ['Liège en Ørsted', 'liege-en-orsted'],
    ['Wordt 2027 warmer dan 2026?', 'wordt-2027-warmer-dan-2026'],
    ['Æbleskiver en Straße', 'aebleskiver-en-strasse'],
    ['🐝🍯', ''],
  ])('%j → %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it('cuts long titles at a word boundary without a trailing dash', () => {
    const slug = slugify('woord '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toMatch(/^woord(-woord)*$/);
  });

  it('hard-cuts a single very long word', () => {
    expect(slugify('a'.repeat(200))).toBe('a'.repeat(SLUG_MAX_LENGTH));
  });
});
