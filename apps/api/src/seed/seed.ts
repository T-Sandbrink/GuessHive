import {
  COUNTRY_CODES,
  countryNames,
  LAUNCH_LOCAL_COUNTRIES,
  normalizeUsername,
  REGIONS,
  slugify,
} from '@guesshive/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { SEED_ADMIN, SEED_CATEGORIES, SEED_QUESTIONS, type SeedQuestion } from './seed-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedOptions {
  adminEmail: string;
  /** Reference time for the relative question dates; injectable for tests. */
  now?: Date;
}

export interface SeedSummary {
  countries: number;
  regions: number;
  categories: number;
  questionsCreated: number;
  questionsSkipped: number;
}

/**
 * Fills a development database (task 1.4). Safe to run repeatedly: reference data is upserted,
 * the admin and the sample questions are only created when missing, and nothing is deleted.
 */
export async function seed(prisma: PrismaClient, options: SeedOptions): Promise<SeedSummary> {
  const now = options.now ?? new Date();

  const launchLocal = new Set<string>(LAUNCH_LOCAL_COUNTRIES);
  for (const code of COUNTRY_CODES) {
    const names = countryNames(code);
    const localEnabled = launchLocal.has(code);
    await prisma.country.upsert({
      where: { code },
      // Only the names are refreshed: an admin may have switched localEnabled since.
      update: { names },
      create: { code, names, localEnabled, localEnabledAt: localEnabled ? now : null },
    });
  }

  for (const region of REGIONS) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: { names: region.names, countryCode: region.countryCode },
      create: region,
    });
  }

  const categoryIds = new Map<string, string>();
  for (const [sortOrder, category] of SEED_CATEGORIES.entries()) {
    const data = { ...category, sortOrder };
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: data,
      create: data,
      select: { id: true },
    });
    categoryIds.set(category.slug, row.id);
  }

  const username = normalizeUsername(SEED_ADMIN.displayUsername);
  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      email: options.adminEmail,
      emailVerified: true,
      username,
      displayUsername: SEED_ADMIN.displayUsername,
      countryCode: SEED_ADMIN.countryCode,
      locale: SEED_ADMIN.locale,
      timezone: SEED_ADMIN.timezone,
      role: 'ADMIN',
      ageConfirmedAt: now,
    },
    select: { id: true },
  });

  let questionsCreated = 0;
  for (const question of SEED_QUESTIONS) {
    const exists = await prisma.question.findUnique({
      where: { shortId: question.shortId },
      select: { id: true },
    });
    if (exists) {
      continue;
    }
    const categoryId = categoryIds.get(question.categorySlug);
    if (categoryId === undefined) {
      throw new Error(
        `Seed question ${question.shortId}: unknown category ${question.categorySlug}`,
      );
    }
    await createQuestion(prisma, question, { categoryId, adminId: admin.id, now });
    questionsCreated++;
  }

  return {
    countries: COUNTRY_CODES.length,
    regions: REGIONS.length,
    categories: SEED_CATEGORIES.length,
    questionsCreated,
    questionsSkipped: SEED_QUESTIONS.length - questionsCreated,
  };
}

async function createQuestion(
  prisma: PrismaClient,
  question: SeedQuestion,
  context: { categoryId: string; adminId: string; now: Date },
): Promise<void> {
  const at = (days: number): Date => new Date(context.now.getTime() + days * DAY_MS);
  const resolved = question.resolvedOptionIndex !== undefined;

  await prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        shortId: question.shortId,
        slug: slugify(question.title[question.defaultLocale]),
        type: question.type,
        status: question.status,
        scope: question.scope,
        countryCode: question.countryCode ?? null,
        regionCode: question.regionCode ?? null,
        darkCorner: question.darkCorner ?? false,
        defaultLocale: question.defaultLocale,
        authorId: context.adminId,
        categoryId: context.categoryId,
        maxChoices: question.maxChoices ?? 1,
        opensAt: at(question.opensInDays),
        closesAt: at(question.closesInDays),
        resolvesAt: question.resolvesInDays === undefined ? null : at(question.resolvesInDays),
        translations: {
          create: [
            { locale: 'nl', title: question.title.nl },
            { locale: 'en', title: question.title.en },
          ],
        },
        options: {
          create: question.options.map((label, position) => ({
            position,
            translations: {
              create: [
                { locale: 'nl', label: label.nl },
                { locale: 'en', label: label.en },
              ],
            },
          })),
        },
      },
      select: { id: true, options: { select: { id: true, position: true } } },
    });

    if (resolved) {
      const option = created.options.find((o) => o.position === question.resolvedOptionIndex);
      if (option === undefined) {
        throw new Error(`Seed question ${question.shortId}: resolvedOptionIndex out of range`);
      }
      await tx.question.update({
        where: { id: created.id },
        data: {
          resolvedOptionId: option.id,
          resolutionSource: question.resolutionSource ?? null,
          resolvedAt: at(question.resolvesInDays ?? question.closesInDays),
          resolvedById: context.adminId,
        },
      });
    }
  });
}
