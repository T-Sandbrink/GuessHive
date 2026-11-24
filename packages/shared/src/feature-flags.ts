import { z } from 'zod';
import type { nodeEnvSchema } from './env.js';

type NodeEnv = z.infer<typeof nodeEnvSchema>;

export interface FeatureFlagDefinition {
  /** What the flag switches, for the admin panel and for agents (English). */
  description: string;
  /**
   * Value when the database has no row for the flag, per runtime mode. Missing modes are off.
   * Every environment has its own database, so a row there overrides this per environment.
   */
  defaults: Partial<Record<NodeEnv, boolean>>;
}

/**
 * Every feature flag the code knows (task 1.11). Flags are off by default everywhere; an admin
 * switches them on per environment (a `FeatureFlag` row) and optionally for single users first.
 * A row whose key is not listed here is ignored. Later tasks register their own flags here.
 */
export const FEATURE_FLAGS = {
  /** Task 7b.6: free-text stake note per group forecast, off until the legal check is done. */
  'groups.stakeNote': {
    description: 'Optional stake note on group forecasts (waits for the legal check).',
    defaults: {},
  },
  /** Phase 13: premium subscription, switched on by the owner after growth. */
  'billing.premium': {
    description: 'Premium subscription (phase 13).',
    defaults: {},
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return Object.hasOwn(FEATURE_FLAGS, key);
}

/** The registry default of a flag in this runtime mode (off unless the registry says on). */
export function featureFlagDefault(key: FeatureFlagKey, nodeEnv: NodeEnv): boolean {
  const definition: FeatureFlagDefinition = FEATURE_FLAGS[key];
  return definition.defaults[nodeEnv] ?? false;
}

/** Most users a flag can be switched on for individually (a staged rollout, not a segment). */
export const FEATURE_FLAG_MAX_USERS = 1_000;

/**
 * `FeatureFlag.rules`: users who get the feature while the flag itself is still off, for
 * testing a feature in production with a few accounts first.
 */
export const featureFlagRulesSchema = z.strictObject({
  userIds: z.array(z.uuid()).max(FEATURE_FLAG_MAX_USERS).default([]),
});

export type FeatureFlagRules = z.infer<typeof featureFlagRulesSchema>;
