import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
  featureFlagDefault,
  featureFlagRulesSchema,
  isFeatureFlagKey,
} from '@guesshive/shared';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/api.exception.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { throttled } from '../redis/redis-errors.js';

/**
 * How long a loaded set of flags is reused. A change made on another api instance shows up
 * here within this window; on the instance that made it, immediately.
 */
export const FEATURE_FLAG_CACHE_MS = 30_000;
/** After a failed read, how long to wait before trying the database again. */
export const FEATURE_FLAG_RETRY_MS = 5_000;
/**
 * How old the last good values may get while the database stays unreachable. After that the
 * registry defaults (off) apply, so a flag switched off elsewhere cannot stay on here for long.
 */
export const FEATURE_FLAG_MAX_STALE_MS = 5 * 60_000;

interface StoredFlag {
  enabled: boolean;
  /** Users who get the feature while the flag is off. */
  userIds: ReadonlySet<string>;
}

type FlagMap = ReadonlyMap<FeatureFlagKey, StoredFlag>;

export interface FeatureFlagContext {
  /** The signed-in user, if any; guests only see flags that are on for everyone. */
  userId?: string | undefined;
}

export interface FeatureFlagUpdate {
  enabled: boolean;
  /** Validated with `featureFlagRulesSchema` here; invalid rules give VALIDATION_FAILED. */
  rules: unknown;
}

/**
 * Feature flags (task 1.11). The registry in `@guesshive/shared` lists every flag with its
 * defaults; a `FeatureFlag` row in this environment's database overrides them. All flags are
 * read in one small query and cached, so checks cost nothing per request. When the database
 * cannot be read, the last good values are kept for a limited time, then the registry defaults
 * (off) apply: a flag never falls back to "on".
 *
 * Personal data: `rules.userIds` and the audit entries hold user ids. Account deletion
 * (PLAN.md 11.2) must remove a deleted user's id from every flag's `userIds`.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly warnLoadFailed = throttled((message) => {
    this.logger.warn(message);
  });
  /** `at`: when to read again; `loadedAt`: when the flags were last read successfully. */
  private cached: { flags: FlagMap; at: number; loadedAt: number } | undefined;
  private inFlight: Promise<FlagMap> | undefined;
  /** Bumped by every update, so a read that started before it cannot cache stale rows. */
  private generation = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'NODE_ENV'>,
  ) {}

  /** Whether a feature is on, for everyone or for this user. */
  async isEnabled(key: FeatureFlagKey, context: FeatureFlagContext = {}): Promise<boolean> {
    return this.evaluate(await this.load(), key, context);
  }

  /** Every registered flag, evaluated for this user against one consistent snapshot. */
  async evaluateAll(context: FeatureFlagContext = {}): Promise<Record<FeatureFlagKey, boolean>> {
    const flags = await this.load();
    return Object.fromEntries(
      FEATURE_FLAG_KEYS.map((key) => [key, this.evaluate(flags, key, context)]),
    ) as Record<FeatureFlagKey, boolean>;
  }

  /**
   * Switches a flag (admin panel, later tasks). `actorId` is the signed-in admin; `null` only
   * for system changes. The audit log records only what changed: the enabled state and the
   * user ids added or removed, not the full lists.
   */
  async update(
    key: FeatureFlagKey,
    update: FeatureFlagUpdate,
    actorId: string | null,
  ): Promise<void> {
    if (!isFeatureFlagKey(key)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown feature flag');
    }
    const parsed = featureFlagRulesSchema.safeParse(update.rules);
    if (!parsed.success) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Invalid feature flag rules',
      );
    }
    const userIds = [...new Set(parsed.data.userIds)];
    const next = { enabled: update.enabled, rules: { userIds } };
    await this.prisma.$transaction(async (tx) => {
      // Serialises concurrent updates of the same flag, so each audit entry's "from" is right.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`feature_flag:${key}`}))`;
      const previous = await tx.featureFlag.findUnique({ where: { key } });
      const stored = previous ? featureFlagRulesSchema.safeParse(previous.rules) : undefined;
      const before = stored?.success ? [...new Set(stored.data.userIds)] : [];
      await tx.featureFlag.upsert({ where: { key }, update: next, create: { key, ...next } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'feature_flag.update',
          targetType: 'FeatureFlag',
          targetId: key,
          meta: {
            enabled: { from: previous?.enabled ?? null, to: next.enabled },
            usersAdded: userIds.filter((id) => !before.includes(id)),
            usersRemoved: before.filter((id) => !userIds.includes(id)),
            // The old rules were unreadable (edited by hand), so usersRemoved may be incomplete.
            ...(stored && !stored.success ? { previousRulesInvalid: true } : {}),
          },
        },
      });
    });
    this.generation++;
    this.cached = undefined;
    this.inFlight = undefined;
  }

  private evaluate(flags: FlagMap, key: FeatureFlagKey, context: FeatureFlagContext): boolean {
    if (!isFeatureFlagKey(key)) {
      return false;
    }
    const flag = flags.get(key);
    if (!flag) {
      return featureFlagDefault(key, this.env.NODE_ENV);
    }
    return flag.enabled || (context.userId !== undefined && flag.userIds.has(context.userId));
  }

  private load(): Promise<FlagMap> {
    if (this.cached && Date.now() < this.cached.at) {
      return Promise.resolve(this.cached.flags);
    }
    if (!this.inFlight) {
      const pending = this.read().finally(() => {
        if (this.inFlight === pending) {
          this.inFlight = undefined;
        }
      });
      this.inFlight = pending;
    }
    return this.inFlight;
  }

  private async read(): Promise<FlagMap> {
    const generation = this.generation;
    let rows: { key: string; enabled: boolean; rules: unknown }[];
    try {
      rows = await this.prisma.featureFlag.findMany({
        select: { key: true, enabled: true, rules: true },
      });
    } catch {
      // No error details: they can contain connection information. At most once a minute.
      this.warnLoadFailed('Could not load feature flags; using the last known values');
      const now = Date.now();
      const last = this.cached;
      const usable = last !== undefined && now - last.loadedAt < FEATURE_FLAG_MAX_STALE_MS;
      const flags: FlagMap = usable ? last.flags : new Map();
      if (generation === this.generation) {
        this.cached = usable
          ? {
              flags,
              // Never serve the last known values past their maximum age.
              at: Math.min(now + FEATURE_FLAG_RETRY_MS, last.loadedAt + FEATURE_FLAG_MAX_STALE_MS),
              loadedAt: last.loadedAt,
            }
          : { flags, at: now + FEATURE_FLAG_RETRY_MS, loadedAt: 0 };
      }
      return flags;
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
    if (generation === this.generation) {
      const now = Date.now();
      this.cached = { flags, at: now + FEATURE_FLAG_CACHE_MS, loadedAt: now };
    }
    return flags;
  }
}
