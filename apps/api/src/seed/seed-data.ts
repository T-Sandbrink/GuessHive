import type { CountryCode, Locale } from '@guesshive/shared';
import type { QuestionScope, QuestionStatus, QuestionType } from '../generated/prisma/client.js';

type Localized = Record<Locale, string>;

export interface SeedCategory {
  slug: string;
  names: Localized;
  /** Emoji from PLAN.md "Lancering & landen"; the UI may map it to an icon later. */
  icon: string;
  sensitive: boolean;
}

/** The 10 launch categories (PLAN.md "Lancering & landen"), in display order. */
export const SEED_CATEGORIES: readonly SeedCategory[] = [
  { slug: 'sport', names: { nl: 'Sport', en: 'Sport' }, icon: '⚽', sensitive: false },
  {
    slug: 'food-drink',
    names: { nl: 'Eten & drinken', en: 'Food & drink' },
    icon: '🍽',
    sensitive: false,
  },
  {
    slug: 'entertainment',
    names: { nl: 'Entertainment', en: 'Entertainment' },
    icon: '🎬',
    sensitive: false,
  },
  { slug: 'news', names: { nl: 'Actualiteit', en: 'News' }, icon: '📰', sensitive: false },
  {
    slug: 'politics-society',
    names: { nl: 'Politiek & maatschappij', en: 'Politics & society' },
    icon: '🏛',
    sensitive: true,
  },
  {
    slug: 'lifestyle-relationships',
    names: { nl: 'Lifestyle & relaties', en: 'Lifestyle & relationships' },
    icon: '💛',
    sensitive: false,
  },
  { slug: 'tech', names: { nl: 'Tech', en: 'Tech' }, icon: '💻', sensitive: false },
  {
    slug: 'weather-nature',
    names: { nl: 'Weer & natuur', en: 'Weather & nature' },
    icon: '🌦',
    sensitive: false,
  },
  {
    slug: 'local',
    names: { nl: 'Lokaal & je buurt', en: 'Local & your neighbourhood' },
    icon: '🏘',
    sensitive: false,
  },
  {
    slug: 'this-or-that',
    names: { nl: 'Dit of dat', en: 'This or that' },
    icon: '🎲',
    sensitive: false,
  },
];

/** Development admin; the email can be overridden with SEED_ADMIN_EMAIL. No password: auth arrives in phase 2. */
export const SEED_ADMIN = {
  defaultEmail: 'admin@guesshive.test',
  displayUsername: 'Admin',
  countryCode: 'NL',
  locale: 'nl',
  timezone: 'Europe/Amsterdam',
} as const;

export interface SeedQuestion {
  /** Fixed short id (ADR 0004 alphabet) so a re-run recognises the question and skips it. */
  shortId: string;
  type: QuestionType;
  status: QuestionStatus;
  scope: Exclude<QuestionScope, 'GROUP'>;
  countryCode?: CountryCode;
  regionCode?: string;
  categorySlug: string;
  defaultLocale: Locale;
  darkCorner?: boolean;
  maxChoices?: number;
  /** Days relative to the seed run; negative is in the past. */
  opensInDays: number;
  closesInDays: number;
  resolvesInDays?: number;
  title: Localized;
  options: readonly Localized[];
  /** Index into `options` for RESOLVED predictions. */
  resolvedOptionIndex?: number;
  resolutionSource?: string;
}

const YES_NO: readonly Localized[] = [
  { nl: 'Ja', en: 'Yes' },
  { nl: 'Nee', en: 'No' },
];

/** Development data covering every type, scope and the main statuses; not the launch content (task 12.6). */
export const SEED_QUESTIONS: readonly SeedQuestion[] = [
  {
    shortId: 'seed22',
    type: 'POLL_SINGLE',
    status: 'OPEN',
    scope: 'GLOBAL',
    categorySlug: 'sport',
    defaultLocale: 'en',
    opensInDays: -3,
    closesInDays: 30,
    title: { nl: 'Wie is de beste voetballer ooit?', en: 'Who is the best footballer ever?' },
    options: [
      { nl: 'Lionel Messi', en: 'Lionel Messi' },
      { nl: 'Cristiano Ronaldo', en: 'Cristiano Ronaldo' },
      { nl: 'Pelé', en: 'Pelé' },
      { nl: 'Johan Cruijff', en: 'Johan Cruyff' },
    ],
  },
  {
    shortId: 'seed23',
    type: 'POLL_SINGLE',
    status: 'OPEN',
    scope: 'COUNTRY',
    countryCode: 'NL',
    categorySlug: 'food-drink',
    defaultLocale: 'nl',
    opensInDays: -2,
    closesInDays: 14,
    title: { nl: 'Wat is je favoriete avondeten?', en: 'What is your favourite dinner?' },
    options: [
      { nl: 'Stamppot', en: 'Stamppot' },
      { nl: 'Pasta', en: 'Pasta' },
      { nl: 'Pizza', en: 'Pizza' },
      { nl: 'Rijsttafel', en: 'Rijsttafel' },
      { nl: 'Friet', en: 'Fries' },
    ],
  },
  {
    shortId: 'seed24',
    type: 'POLL_MULTI',
    status: 'OPEN',
    scope: 'GLOBAL',
    categorySlug: 'entertainment',
    defaultLocale: 'en',
    maxChoices: 3,
    opensInDays: -1,
    closesInDays: 21,
    title: {
      nl: 'Welke streamingdiensten gebruik je?',
      en: 'Which streaming services do you use?',
    },
    options: [
      { nl: 'Netflix', en: 'Netflix' },
      { nl: 'Disney+', en: 'Disney+' },
      { nl: 'Prime Video', en: 'Prime Video' },
      { nl: 'Spotify', en: 'Spotify' },
      { nl: 'Geen', en: 'None' },
    ],
  },
  {
    shortId: 'seed25',
    type: 'THIS_OR_THAT',
    status: 'OPEN',
    scope: 'GLOBAL',
    categorySlug: 'this-or-that',
    defaultLocale: 'en',
    opensInDays: -5,
    closesInDays: 60,
    title: { nl: 'Koffie of thee?', en: 'Coffee or tea?' },
    options: [
      { nl: 'Koffie', en: 'Coffee' },
      { nl: 'Thee', en: 'Tea' },
    ],
  },
  {
    shortId: 'seed26',
    type: 'THIS_OR_THAT',
    status: 'OPEN',
    scope: 'COUNTRY',
    countryCode: 'BE',
    categorySlug: 'food-drink',
    defaultLocale: 'nl',
    opensInDays: -1,
    closesInDays: 30,
    title: { nl: 'Frieten met mayonaise of stoofvleessaus?', en: 'Fries with mayo or stew sauce?' },
    options: [
      { nl: 'Mayonaise', en: 'Mayonnaise' },
      { nl: 'Stoofvleessaus', en: 'Stew sauce' },
    ],
  },
  {
    shortId: 'seed27',
    type: 'PREDICTION_BINARY',
    status: 'OPEN',
    scope: 'COUNTRY',
    countryCode: 'NL',
    categorySlug: 'sport',
    defaultLocale: 'nl',
    opensInDays: -7,
    closesInDays: 90,
    resolvesInDays: 180,
    title: {
      nl: 'Wordt Ajax dit seizoen landskampioen?',
      en: 'Will Ajax win the Eredivisie this season?',
    },
    options: YES_NO,
  },
  {
    shortId: 'seed28',
    type: 'PREDICTION_BINARY',
    status: 'OPEN',
    scope: 'COUNTRY',
    countryCode: 'NL',
    categorySlug: 'weather-nature',
    defaultLocale: 'nl',
    opensInDays: -1,
    closesInDays: 20,
    resolvesInDays: 40,
    title: { nl: 'Gaat het sneeuwen met kerst?', en: 'Will it snow at Christmas?' },
    options: YES_NO,
  },
  {
    shortId: 'seed29',
    type: 'PREDICTION_CHOICE',
    status: 'OPEN',
    scope: 'GLOBAL',
    categorySlug: 'tech',
    defaultLocale: 'en',
    opensInDays: -4,
    closesInDays: 45,
    resolvesInDays: 365,
    title: {
      nl: 'Welk merk verkoopt volgend jaar de meeste smartphones?',
      en: 'Which brand will sell the most smartphones next year?',
    },
    options: [
      { nl: 'Apple', en: 'Apple' },
      { nl: 'Samsung', en: 'Samsung' },
      { nl: 'Xiaomi', en: 'Xiaomi' },
      { nl: 'Een ander merk', en: 'Another brand' },
    ],
  },
  {
    shortId: 'seed2a',
    type: 'PREDICTION_BINARY',
    status: 'RESOLVED',
    scope: 'GLOBAL',
    categorySlug: 'news',
    defaultLocale: 'en',
    opensInDays: -40,
    closesInDays: -10,
    resolvesInDays: -5,
    title: {
      nl: 'Was het afgelopen jaar het warmste jaar ooit gemeten?',
      en: 'Was last year the warmest year on record?',
    },
    options: YES_NO,
    resolvedOptionIndex: 0,
    resolutionSource: 'https://example.test/climate-report',
  },
  {
    shortId: 'seed2b',
    type: 'PREDICTION_CHOICE',
    status: 'CLOSED',
    scope: 'COUNTRY',
    countryCode: 'BE',
    categorySlug: 'sport',
    defaultLocale: 'nl',
    opensInDays: -30,
    closesInDays: -1,
    resolvesInDays: 2,
    title: {
      nl: 'Wie wint de Ronde van Vlaanderen?',
      en: 'Who will win the Tour of Flanders?',
    },
    options: [
      { nl: 'Een Belg', en: 'A Belgian' },
      { nl: 'Een Nederlander', en: 'A Dutch rider' },
      { nl: 'Iemand anders', en: 'Someone else' },
    ],
  },
  {
    shortId: 'seed2c',
    type: 'POLL_SINGLE',
    status: 'OPEN',
    scope: 'REGION',
    countryCode: 'NL',
    regionCode: 'NL-UT',
    categorySlug: 'local',
    defaultLocale: 'nl',
    opensInDays: -2,
    closesInDays: 30,
    title: {
      nl: 'Wat is de mooiste plek in de provincie Utrecht?',
      en: 'What is the most beautiful place in the province of Utrecht?',
    },
    options: [
      { nl: 'De Dom', en: 'The Dom Tower' },
      { nl: 'De Utrechtse Heuvelrug', en: 'The Utrecht Hill Ridge' },
      { nl: 'De Vecht', en: 'The Vecht river' },
    ],
  },
  {
    shortId: 'seed2d',
    type: 'POLL_SINGLE',
    status: 'OPEN',
    scope: 'REGION',
    countryCode: 'BE',
    regionCode: 'BE-VAN',
    categorySlug: 'local',
    defaultLocale: 'nl',
    opensInDays: -1,
    closesInDays: 30,
    title: {
      nl: 'Hoe ga je meestal naar je werk of school?',
      en: 'How do you usually get to work or school?',
    },
    options: [
      { nl: 'Fiets', en: 'Bike' },
      { nl: 'Auto', en: 'Car' },
      { nl: 'Tram of bus', en: 'Tram or bus' },
      { nl: 'Te voet', en: 'On foot' },
    ],
  },
  {
    shortId: 'seed2e',
    type: 'POLL_SINGLE',
    status: 'PENDING_REVIEW',
    scope: 'COUNTRY',
    countryCode: 'NL',
    categorySlug: 'politics-society',
    defaultLocale: 'nl',
    opensInDays: 0,
    closesInDays: 30,
    title: {
      nl: 'Moet de stemgerechtigde leeftijd naar 16 jaar?',
      en: 'Should the voting age be lowered to 16?',
    },
    options: [
      { nl: 'Ja', en: 'Yes' },
      { nl: 'Nee', en: 'No' },
      { nl: 'Weet ik niet', en: "Don't know" },
    ],
  },
  {
    shortId: 'seed2f',
    type: 'THIS_OR_THAT',
    status: 'OPEN',
    scope: 'GLOBAL',
    categorySlug: 'lifestyle-relationships',
    defaultLocale: 'en',
    opensInDays: -6,
    closesInDays: 40,
    title: { nl: 'Ochtendmens of avondmens?', en: 'Morning person or night owl?' },
    options: [
      { nl: 'Ochtendmens', en: 'Morning person' },
      { nl: 'Avondmens', en: 'Night owl' },
    ],
  },
  {
    shortId: 'seed2g',
    type: 'POLL_SINGLE',
    status: 'OPEN',
    scope: 'GLOBAL',
    categorySlug: 'lifestyle-relationships',
    defaultLocale: 'en',
    darkCorner: true,
    opensInDays: -2,
    closesInDays: 30,
    title: {
      nl: 'Heb je ooit iemand gedate die je online hebt ontmoet?',
      en: 'Have you ever dated someone you met online?',
    },
    options: [
      { nl: 'Ja', en: 'Yes' },
      { nl: 'Nee', en: 'No' },
      { nl: 'Zeg ik liever niet', en: 'Rather not say' },
    ],
  },
  {
    shortId: 'seed2h',
    type: 'POLL_MULTI',
    status: 'OPEN',
    scope: 'COUNTRY',
    countryCode: 'NL',
    categorySlug: 'entertainment',
    defaultLocale: 'nl',
    maxChoices: 2,
    opensInDays: -3,
    closesInDays: 25,
    title: {
      nl: 'Welke Nederlandse feestdagen vier je het liefst?',
      en: 'Which Dutch holidays do you enjoy celebrating most?',
    },
    options: [
      { nl: 'Koningsdag', en: "King's Day" },
      { nl: 'Sinterklaas', en: 'Sinterklaas' },
      { nl: 'Kerst', en: 'Christmas' },
      { nl: 'Oud en Nieuw', en: "New Year's Eve" },
    ],
  },
  {
    shortId: 'seed2j',
    type: 'PREDICTION_BINARY',
    status: 'OPEN',
    scope: 'GLOBAL',
    categorySlug: 'tech',
    defaultLocale: 'en',
    opensInDays: -2,
    closesInDays: 120,
    resolvesInDays: 365,
    title: {
      nl: 'Rijden er volgend jaar zelfrijdende taxi’s in Amsterdam?',
      en: 'Will self-driving taxis operate in Amsterdam next year?',
    },
    options: YES_NO,
  },
  {
    shortId: 'seed2k',
    type: 'THIS_OR_THAT',
    status: 'CLOSED',
    scope: 'GLOBAL',
    categorySlug: 'this-or-that',
    defaultLocale: 'en',
    opensInDays: -30,
    closesInDays: -2,
    title: { nl: 'Strand of bergen?', en: 'Beach or mountains?' },
    options: [
      { nl: 'Strand', en: 'Beach' },
      { nl: 'Bergen', en: 'Mountains' },
    ],
  },
  {
    shortId: 'seed2m',
    type: 'POLL_SINGLE',
    status: 'DRAFT',
    scope: 'GLOBAL',
    categorySlug: 'weather-nature',
    defaultLocale: 'en',
    opensInDays: 1,
    closesInDays: 30,
    title: { nl: 'Wat is je favoriete seizoen?', en: 'What is your favourite season?' },
    options: [
      { nl: 'Lente', en: 'Spring' },
      { nl: 'Zomer', en: 'Summer' },
      { nl: 'Herfst', en: 'Autumn' },
      { nl: 'Winter', en: 'Winter' },
    ],
  },
  {
    shortId: 'seed2n',
    type: 'PREDICTION_CHOICE',
    status: 'RESOLVED',
    scope: 'COUNTRY',
    countryCode: 'NL',
    categorySlug: 'entertainment',
    defaultLocale: 'nl',
    opensInDays: -60,
    closesInDays: -20,
    resolvesInDays: -15,
    title: {
      nl: 'Welke film trekt dit najaar de meeste bezoekers?',
      en: 'Which film will draw the most visitors this autumn?',
    },
    options: [
      { nl: 'Een Nederlandse film', en: 'A Dutch film' },
      { nl: 'Een Hollywoodfilm', en: 'A Hollywood film' },
      { nl: 'Een animatiefilm', en: 'An animated film' },
    ],
    resolvedOptionIndex: 2,
    resolutionSource: 'https://example.test/box-office',
  },
];
