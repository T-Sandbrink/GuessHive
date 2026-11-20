import { describe, expect, it } from 'vitest';
import { normalizeUsername, USERNAME_PATTERN } from './usernames.js';

describe('USERNAME_PATTERN', () => {
  it.each([
    'SamDeBij',
    'jan_de.vries',
    'Bee2026',
    '2bee',
    'a',
    'sam_',
    'sam.',
    'sam..bij',
    'a._b',
    '9',
  ])('accepts %s', (name) => {
    expect(USERNAME_PATTERN.test(name)).toBe(true);
  });

  it.each([
    '',
    '_',
    '.',
    '..',
    '_sam',
    '.sam',
    'Renée',
    'Çağla',
    'Σαμ',
    'İsmail',
    'sam bij',
    'sam-bij',
    'sam@bij',
    'sam\n',
  ])('rejects %j', (name) => {
    expect(USERNAME_PATTERN.test(name)).toBe(false);
  });
});

describe('normalizeUsername', () => {
  it('lowercases ASCII so different casings collide', () => {
    expect(normalizeUsername('SamDeBij')).toBe('samdebij');
    expect(normalizeUsername('SAMDEBIJ')).toBe(normalizeUsername('samdebij'));
  });

  it('keeps digits, underscores and dots', () => {
    expect(normalizeUsername('Jan_De.Vries2026')).toBe('jan_de.vries2026');
  });
});
