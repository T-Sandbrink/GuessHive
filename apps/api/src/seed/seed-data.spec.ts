import {
  COUNTRY_CODES,
  REGIONS,
  slugify,
  SUPPORTED_LOCALES,
  USERNAME_PATTERN,
} from '@guesshive/shared';
import { describe, expect, it } from 'vitest';
import { QuestionType } from '../generated/prisma/enums.js';
import { SEED_ADMIN, SEED_CATEGORIES, SEED_QUESTIONS, type SeedQuestion } from './seed-data.js';

// Limits mirror schema.prisma: QuestionTranslation.title VarChar(200), QuestionOptionTranslation.label VarChar(120).
const TITLE_MAX = 200;
const LABEL_MAX = 120;
// ADR 0004: 6 characters, lowercase letters and digits without look-alikes (0 o 1 i l).
const SHORT_ID_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;

const isPrediction = (q: SeedQuestion): boolean =>
  q.type === 'PREDICTION_BINARY' || q.type === 'PREDICTION_CHOICE';

describe('SEED_CATEGORIES', () => {
  it('has the 10 launch categories with unique slugs', () => {
    expect(SEED_CATEGORIES).toHaveLength(10);
    const slugs = SEED_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('marks exactly one category sensitive: politics-society', () => {
    const sensitive = SEED_CATEGORIES.filter((c) => c.sensitive).map((c) => c.slug);
    expect(sensitive).toEqual(['politics-society']);
  });

  it('has non-empty names in every locale and an icon', () => {
    for (const category of SEED_CATEGORIES) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(category.names[locale].trim(), `${category.slug}.${locale}`).not.toBe('');
      }
      expect(category.icon).not.toBe('');
    }
  });

  it('uses slugs that are already in slug form', () => {
    for (const category of SEED_CATEGORIES) {
      expect(slugify(category.slug)).toBe(category.slug);
    }
  });
});

describe('SEED_ADMIN', () => {
  it('has a display username that matches USERNAME_PATTERN', () => {
    expect(SEED_ADMIN.displayUsername).toMatch(USERNAME_PATTERN);
  });

  it('uses a known country and supported locale', () => {
    expect(COUNTRY_CODES).toContain(SEED_ADMIN.countryCode);
    expect(SUPPORTED_LOCALES).toContain(SEED_ADMIN.locale);
  });
});

describe('SEED_QUESTIONS', () => {
  const categorySlugs = new Set(SEED_CATEGORIES.map((c) => c.slug));

  it('is not empty', () => {
    expect(SEED_QUESTIONS.length).toBeGreaterThan(0);
  });

  it('has unique short ids in the ADR 0004 format', () => {
    const ids = SEED_QUESTIONS.map((q) => q.shortId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(SHORT_ID_PATTERN);
    }
  });

  it('covers every QuestionType', () => {
    const covered = new Set(SEED_QUESTIONS.map((q) => q.type));
    expect([...covered].sort()).toEqual(Object.values(QuestionType).sort());
  });

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s has non-empty nl and en text within the column limits',
    (_id, q) => {
      expect(SUPPORTED_LOCALES).toContain(q.defaultLocale);
      for (const locale of SUPPORTED_LOCALES) {
        const title = q.title[locale];
        expect(title.trim(), `title.${locale}`).not.toBe('');
        expect(title.length, `title.${locale}`).toBeLessThanOrEqual(TITLE_MAX);
        q.options.forEach((option, i) => {
          const label = option[locale];
          expect(label.trim(), `option ${String(i)}.${locale}`).not.toBe('');
          expect(label.length, `option ${String(i)}.${locale}`).toBeLessThanOrEqual(LABEL_MAX);
        });
      }
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s has distinct option labels per locale',
    (_id, q) => {
      for (const locale of SUPPORTED_LOCALES) {
        const labels = q.options.map((o) => o[locale]);
        expect(new Set(labels).size, locale).toBe(labels.length);
      }
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s references an existing category',
    (_id, q) => {
      expect(categorySlugs.has(q.categorySlug)).toBe(true);
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s has an option count that fits its type',
    (_id, q) => {
      if (q.type === 'THIS_OR_THAT' || q.type === 'PREDICTION_BINARY') {
        expect(q.options).toHaveLength(2);
      } else {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s only sets maxChoices > 1 on POLL_MULTI, within the option count',
    (_id, q) => {
      if (q.maxChoices === undefined) {
        return;
      }
      expect(Number.isInteger(q.maxChoices)).toBe(true);
      expect(q.maxChoices).toBeGreaterThanOrEqual(1);
      expect(q.maxChoices).toBeLessThanOrEqual(q.options.length);
      if (q.maxChoices > 1) {
        expect(q.type).toBe('POLL_MULTI');
      }
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s follows the scope rules',
    (_id, q) => {
      switch (q.scope) {
        case 'GLOBAL':
          expect(q.countryCode).toBeUndefined();
          expect(q.regionCode).toBeUndefined();
          break;
        case 'COUNTRY':
          expect(q.countryCode).toBeDefined();
          expect(COUNTRY_CODES).toContain(q.countryCode);
          expect(q.regionCode).toBeUndefined();
          break;
        case 'REGION': {
          expect(q.countryCode).toBeDefined();
          expect(q.regionCode).toBeDefined();
          const region = REGIONS.find((r) => r.code === q.regionCode);
          expect(region, `region ${q.regionCode ?? '(none)'}`).toBeDefined();
          expect(region?.countryCode).toBe(q.countryCode);
          break;
        }
      }
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s has a consistent timeline',
    (_id, q) => {
      expect(q.closesInDays).toBeGreaterThan(q.opensInDays);
      if (q.resolvesInDays !== undefined) {
        expect(isPrediction(q)).toBe(true);
        expect(q.resolvesInDays).toBeGreaterThanOrEqual(q.closesInDays);
      }
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s only has a resolution when it is a RESOLVED prediction',
    (_id, q) => {
      if (q.status === 'RESOLVED') {
        expect(isPrediction(q)).toBe(true);
        expect(q.resolvedOptionIndex).toBeDefined();
        expect(Number.isInteger(q.resolvedOptionIndex)).toBe(true);
        expect(q.resolvedOptionIndex).toBeGreaterThanOrEqual(0);
        expect(q.resolvedOptionIndex).toBeLessThan(q.options.length);
      } else {
        expect(q.resolvedOptionIndex).toBeUndefined();
        expect(q.resolutionSource).toBeUndefined();
      }
    },
  );

  it.each(SEED_QUESTIONS.map((q) => [q.shortId, q] as const))(
    '%s has a default-locale title that slugifies to something non-empty',
    (_id, q) => {
      expect(slugify(q.title[q.defaultLocale])).not.toBe('');
    },
  );
});
