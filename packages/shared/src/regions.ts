import type { CountryCode } from './countries.js';
import type { Locale } from './locales.js';

export interface RegionDefinition {
  /** ISO 3166-2 code, e.g. `NL-UT`. */
  code: string;
  countryCode: CountryCode;
  names: Record<Locale, string>;
}

/**
 * Regions (provinces) of the launch countries, ISO 3166-2. Belgium uses its ten provinces plus
 * the Brussels-Capital Region, so every Belgian address falls in exactly one region. Other
 * countries follow with task 6.1.
 */
export const REGIONS: readonly RegionDefinition[] = [
  { code: 'NL-DR', countryCode: 'NL', names: { nl: 'Drenthe', en: 'Drenthe' } },
  { code: 'NL-FL', countryCode: 'NL', names: { nl: 'Flevoland', en: 'Flevoland' } },
  { code: 'NL-FR', countryCode: 'NL', names: { nl: 'Friesland', en: 'Friesland' } },
  { code: 'NL-GE', countryCode: 'NL', names: { nl: 'Gelderland', en: 'Gelderland' } },
  { code: 'NL-GR', countryCode: 'NL', names: { nl: 'Groningen', en: 'Groningen' } },
  { code: 'NL-LI', countryCode: 'NL', names: { nl: 'Limburg', en: 'Limburg' } },
  { code: 'NL-NB', countryCode: 'NL', names: { nl: 'Noord-Brabant', en: 'North Brabant' } },
  { code: 'NL-NH', countryCode: 'NL', names: { nl: 'Noord-Holland', en: 'North Holland' } },
  { code: 'NL-OV', countryCode: 'NL', names: { nl: 'Overijssel', en: 'Overijssel' } },
  { code: 'NL-UT', countryCode: 'NL', names: { nl: 'Utrecht', en: 'Utrecht' } },
  { code: 'NL-ZE', countryCode: 'NL', names: { nl: 'Zeeland', en: 'Zeeland' } },
  { code: 'NL-ZH', countryCode: 'NL', names: { nl: 'Zuid-Holland', en: 'South Holland' } },
  { code: 'BE-VAN', countryCode: 'BE', names: { nl: 'Antwerpen', en: 'Antwerp' } },
  { code: 'BE-VLI', countryCode: 'BE', names: { nl: 'Limburg', en: 'Limburg' } },
  { code: 'BE-VOV', countryCode: 'BE', names: { nl: 'Oost-Vlaanderen', en: 'East Flanders' } },
  { code: 'BE-VBR', countryCode: 'BE', names: { nl: 'Vlaams-Brabant', en: 'Flemish Brabant' } },
  { code: 'BE-VWV', countryCode: 'BE', names: { nl: 'West-Vlaanderen', en: 'West Flanders' } },
  { code: 'BE-WBR', countryCode: 'BE', names: { nl: 'Waals-Brabant', en: 'Walloon Brabant' } },
  { code: 'BE-WHT', countryCode: 'BE', names: { nl: 'Henegouwen', en: 'Hainaut' } },
  { code: 'BE-WLG', countryCode: 'BE', names: { nl: 'Luik', en: 'Liège' } },
  { code: 'BE-WLX', countryCode: 'BE', names: { nl: 'Luxemburg', en: 'Luxembourg' } },
  { code: 'BE-WNA', countryCode: 'BE', names: { nl: 'Namen', en: 'Namur' } },
  {
    code: 'BE-BRU',
    countryCode: 'BE',
    names: { nl: 'Brussels Hoofdstedelijk Gewest', en: 'Brussels-Capital Region' },
  },
];
