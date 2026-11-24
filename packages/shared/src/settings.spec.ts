import { describe, expect, it } from 'vitest';
import {
  APP_SETTINGS,
  isSettingKey,
  parseSettingValue,
  SETTING_CATEGORIES,
  SETTING_KEYS,
  type SettingKey,
  settingDefinition,
} from './settings.js';

describe('settings registry', () => {
  it.each(SETTING_KEYS)('%s: key fits AppSetting.key, default within its own bounds', (key) => {
    expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);
    expect(key.length).toBeLessThanOrEqual(64);
    const definition = settingDefinition(key);
    expect(definition.schema.safeParse(definition.default).success).toBe(true);
    if (definition.type === 'integer') {
      expect(definition.min).toBeLessThanOrEqual(definition.default);
      expect(definition.default).toBeLessThanOrEqual(definition.max);
    }
    expect(Object.keys(SETTING_CATEGORIES)).toContain(definition.category);
    expect(definition.description.nl.trim()).not.toBe('');
    expect(definition.description.en.trim()).not.toBe('');
  });

  it('never registers legal or privacy rules as settings (AGENTS.md §8)', () => {
    for (const key of SETTING_KEYS) {
      expect(key).not.toMatch(/age|anonym|kAnon|retention|darkCorner/i);
    }
  });

  it('has the password length from PLAN.md: default 12, allowed 8 to 64', () => {
    expect(APP_SETTINGS['auth.passwordMinLength']).toMatchObject({
      type: 'integer',
      default: 12,
      min: 8,
      max: 64,
    });
  });

  it('recognises only registered keys', () => {
    expect(isSettingKey('auth.passwordMinLength')).toBe(true);
    expect(isSettingKey('auth.unknown')).toBe(false);
    expect(isSettingKey('constructor')).toBe(false);
    expect(isSettingKey('__proto__')).toBe(false);
  });
});

describe('parseSettingValue', () => {
  it('accepts values inside the hard bounds', () => {
    expect(parseSettingValue('auth.passwordMinLength', 8)).toBe(8);
    expect(parseSettingValue('auth.passwordMinLength', 64)).toBe(64);
  });

  it.each([7, 65, 12.5, '12', null, undefined, true, Number.NaN, Infinity])(
    'rejects %s for the password length',
    (value) => {
      expect(parseSettingValue('auth.passwordMinLength', value)).toBeUndefined();
    },
  );

  it('rejects unknown keys', () => {
    expect(parseSettingValue('constructor' as SettingKey, 12)).toBeUndefined();
  });
});
