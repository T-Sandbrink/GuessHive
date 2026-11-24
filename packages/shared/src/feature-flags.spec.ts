import { describe, expect, it } from 'vitest';
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_MAX_USERS,
  featureFlagDefault,
  featureFlagRulesSchema,
  isFeatureFlagKey,
} from './feature-flags.js';

const USER = '019ab1c2-0000-7000-8000-000000000001';

describe('feature flag registry', () => {
  it('uses short dotted keys that fit FeatureFlag.key (varchar 64)', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);
      expect(key.length).toBeLessThanOrEqual(64);
    }
  });

  it('starts every flag off in every environment', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      for (const env of ['development', 'test', 'production'] as const) {
        expect(featureFlagDefault(key, env)).toBe(false);
      }
    }
  });

  it('recognises only registered keys', () => {
    expect(isFeatureFlagKey('groups.stakeNote')).toBe(true);
    expect(isFeatureFlagKey('groups.unknown')).toBe(false);
    expect(isFeatureFlagKey('toString')).toBe(false);
    expect(isFeatureFlagKey('__proto__')).toBe(false);
  });
});

describe('featureFlagRulesSchema', () => {
  it('defaults to no users', () => {
    expect(featureFlagRulesSchema.parse({})).toEqual({ userIds: [] });
  });

  it('accepts uuid user ids', () => {
    expect(featureFlagRulesSchema.parse({ userIds: [USER] })).toEqual({ userIds: [USER] });
  });

  it.each([
    ['a non-uuid id', { userIds: ['sam'] }],
    ['unknown keys', { userIds: [], percentage: 50 }],
    ['a non-array', { userIds: USER }],
    ['too many users', { userIds: Array.from({ length: FEATURE_FLAG_MAX_USERS + 1 }, () => USER) }],
    ['null', null],
  ])('rejects %s', (_, rules) => {
    expect(featureFlagRulesSchema.safeParse(rules).success).toBe(false);
  });
});
