import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
  featureFlagDefault,
  type FeatureFlagRules,
  featureFlagRulesSchema,
  isFeatureFlagKey,
} from '@guesshive/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * How long a loaded set of flags is reused. A change made on another api instance shows up
 * here within this window; on the instance that made it, immediately.
 */
export const FEATURE_FLAG_CACHE_MS = 30_000;

interface StoredFlag {
  enabled: boolean;
  /** Users who get the feature while the flag is off. */
  userIds: ReadonlySet<string>;
}

export interface FeatureFlagContext {
  /** The signed-in user, if any; guests only see flags that are on for everyone. */
  userId?: string | undefined;
}

export interface FeatureFlagUpdate {
  enabled: boolean;
  rules: FeatureFlagRules;
}

/**
 * Feature flags (task 1.11). The registry in `@guesshive/shared` lists every flag with its
 * defaults; a `FeatureFlag` row in this environment's database overrides them. All flags are
 * read in one small query and cached, so checks cost nothing per request. When the database
 * cannot be read, flags fall back to their registry defaults (off), never to "on".
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private cached: { flags: ReadonlyMap<FeatureFlagKey, StoredFlag>; at: number } | undefined;
  private inFlight: Promise<ReadonlyMap<FeatureFlagKey, StoredFlag>> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'NODE_ENV'>,
  ) {}

  /** Whether a feature is on, for everyone or for this user. */
  async isEnabled(key: FeatureFlagKey, context: FeatureFlagContext = {}): Promise<boolean> {
    const flag = (await this.load()).get(key);
    if (!flag) {
      return featureFlagDefault(key, this.env.NODE_ENV);
    }
    return flag.enabled || (context.userId !== undefined && flag.userIds.has(context.userId));
  }

  /** Every registered flag, evaluated for this user (for the web app and the admin panel). */
  async evaluateAll(context: FeatureFlagContext = {}): Promise<Record<FeatureFlagKey, boolean>> {
    const entries = await Promise.all(
      FEATURE_FLAG_KEYS.map(async (key) => [key, await this.isEnabled(key, context)] as const),
    );
    return Object.fromEntries(entries) as Record<FeatureFlagKey, boolean>;
  }

  /**
   * Switches a flag (admin panel, later tasks), validating the rules, and records the old and
   * new value in the audit log in the same transaction.
   */
  async update(
    key: FeatureFlagKey,
    update: FeatureFlagUpdate,
    actorId: string | null,
  ): Promise<void> {
    const rules = featureFlagRulesSchema.parse(update.rules);
    const userIds = [...new Set(rules.userIds)];
    const next = { enabled: update.enabled, rules: { userIds } };
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.featureFlag.findUnique({ where: { key } });
      await tx.featureFlag.upsert({
        where: { key },
        update: next,
        create: { key, ...next },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'feature_flag.update',
          targetType: 'FeatureFlag',
          targetId: key,
          meta: {
            from: previous ? { enabled: previous.enabled, rules: previous.rules } : null,
            to: next,
          },
        },
      });
    });
    this.cached = undefined;
  }

  private load(): Promise<ReadonlyMap<FeatureFlagKey, StoredFlag>> {
    if (this.cached && Date.now() - this.cached.at < FEATURE_FLAG_CACHE_MS) {
      return Promise.resolve(this.cached.flags);
    }
    this.inFlight ??= this.read().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async read(): Promise<ReadonlyMap<FeatureFlagKey, StoredFlag>> {
    let rows: { key: string; enabled: boolean; rules: unknown }[];
    try {
      rows = await this.prisma.featureFlag.findMany({
        select: { key: true, enabled: true, rules: true },
      });
    } catch {
      // Keep serving the last good set; without one, the registry defaults apply. The next
      // call retries. No error details: they can contain connection information.
      this.logger.warn('Could not load feature flags; using the last known values');
      return this.cached?.flags ?? new Map();
    }
    const flags = new Map<FeatureFlagKey, StoredFlag>();
    for (const row of rows) {
      if (!isFeatureFlagKey(row.key)) {
        continue;
      }
      const rules = featureFlagRulesSchema.safeParse(row.rules);
      if (!rules.success) {
        // A malformed row (edited by hand) must not switch a feature on for anyone.
        this.logger.warn(`Ignoring invalid rules of feature flag ${row.key}`);
      }
      flags.set(row.key, {
        enabled: rules.success && row.enabled,
        userIds: new Set(rules.success ? rules.data.userIds : []),
      });
    }
    this.cached = { flags, at: Date.now() };
    return flags;
  }
}
