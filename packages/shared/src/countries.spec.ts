import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, countryNames, LAUNCH_LOCAL_COUNTRIES } from './countries.js';
import { REGIONS } from './regions.js';

describe('COUNTRY_CODES', () => {
  it('lists the 249 assigned ISO 3166-1 alpha-2 codes, sorted and unique', () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    expect([...COUNTRY_CODES]).toEqual([...COUNTRY_CODES].sort());
  });

  it('has a real name in every locale for every code', () => {
    for (const code of COUNTRY_CODES) {
      const names = countryNames(code);
      expect(names.nl, code).not.toBe(code);
      expect(names.en, code).not.toBe(code);
    }
  });

  it('names the launch countries in Dutch and English', () => {
    expect(countryNames('NL')).toEqual({ nl: 'Nederland', en: 'Netherlands' });
    expect(countryNames('BE')).toEqual({ nl: 'België', en: 'Belgium' });
    expect(LAUNCH_LOCAL_COUNTRIES).toEqual(['NL', 'BE']);
  });
});

describe('REGIONS', () => {
  it('has unique ISO 3166-2 codes that start with their country code', () => {
    expect(new Set(REGIONS.map((r) => r.code)).size).toBe(REGIONS.length);
    for (const region of REGIONS) {
      expect(region.code).toMatch(/^[A-Z]{2}-[A-Z0-9]{1,3}$/);
      expect(region.code.startsWith(`${region.countryCode}-`)).toBe(true);
    }
  });

  it('covers the 12 Dutch provinces and the 11 Belgian regions', () => {
    expect(REGIONS.filter((r) => r.countryCode === 'NL')).toHaveLength(12);
    expect(REGIONS.filter((r) => r.countryCode === 'BE')).toHaveLength(11);
  });
});
