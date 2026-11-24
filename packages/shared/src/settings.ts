import { z } from 'zod';
import type { Locale } from './locales.js';

/**
 * Admin-adjustable settings (`AppSetting`, task 1.12). Every setting has a default and hard
 * bounds here in code; the api refuses values outside them. Legal and privacy rules (minimum
 * age 16, Dark Corner 18+, k = 10, retention periods) are constants in `privacy.ts` and must
 * never be registered here (AGENTS.md §8).
 */

/** Groups in the admin panel's Instellingen page (4.15b). Later tasks add their own. */
export const SETTING_CATEGORIES = {
  auth: { nl: 'Accounts en inloggen', en: 'Accounts and sign-in' },
} as const satisfies Record<string, Record<Locale, string>>;

export type SettingCategory = keyof typeof SETTING_CATEGORIES;

interface SettingBase<T> {
  category: SettingCategory;
  /** Shown in the admin panel next to the value. */
  description: Record<Locale, string>;
  default: T;
  /** Validates a stored or submitted value, bounds included. */
  schema: z.ZodType<T>;
}

export interface IntegerSetting extends SettingBase<number> {
  type: 'integer';
  /** Hard bounds: no admin can go outside them. */
  min: number;
  max: number;
}

export interface BooleanSetting extends SettingBase<boolean> {
  type: 'boolean';
}

export type SettingDefinition = IntegerSetting | BooleanSetting;

function integerSetting(
  options: Omit<IntegerSetting, 'type' | 'schema'>,
): IntegerSetting & { schema: z.ZodType<number> } {
  return {
    type: 'integer',
    ...options,
    schema: z.number().int().min(options.min).max(options.max),
  };
}

/** Every setting the code knows. Later tasks register their own settings here. */
export const APP_SETTINGS = {
  'auth.passwordMinLength': integerSetting({
    category: 'auth',
    description: {
      nl: 'Minimaal aantal tekens van een wachtwoord bij registreren en wijzigen.',
      en: 'Minimum number of characters for a password when signing up or changing it.',
    },
    default: 12,
    min: 8,
    max: 64,
  }),
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof APP_SETTINGS;

/** The value type of a setting (number for integer settings, boolean for boolean ones). */
export type SettingValue<K extends SettingKey> = (typeof APP_SETTINGS)[K]['default'] extends number
  ? number
  : boolean;

export const SETTING_KEYS = Object.keys(APP_SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(APP_SETTINGS, key);
}

/** The definition of a setting, typed for generic code (admin panel, validation). */
export function settingDefinition(key: SettingKey): SettingDefinition {
  return APP_SETTINGS[key];
}

/**
 * Parses a stored or submitted value against the setting's type and hard bounds.
 * Returns `undefined` when it is not a valid value for this setting.
 */
export function parseSettingValue<K extends SettingKey>(
  key: K,
  value: unknown,
): SettingValue<K> | undefined {
  if (!isSettingKey(key)) {
    return undefined;
  }
  const result = settingDefinition(key).schema.safeParse(value);
  return result.success ? (result.data as SettingValue<K>) : undefined;
}
