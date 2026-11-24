import {
  isSettingKey,
  parseSettingValue,
  SETTING_KEYS,
  type SettingKey,
  type SettingValue,
  settingDefinition,
} from '@guesshive/shared';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/api.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

/** Redis key prefix for cached setting values. */
export const SETTINGS_CACHE_PREFIX = 'settings:v1:';
/** Redis key prefix for the per-setting change counter (see `write`). */
export const SETTINGS_GENERATION_PREFIX = 'settings:v1:gen:';
/** How long a cached value lives; a change drops it at once. */
export const SETTINGS_CACHE_TTL_SECONDS = 60;
/** After a Redis failure, how long to skip the cache and read the database directly. */
export const SETTINGS_REDIS_RETRY_MS = 5_000;

/**
 * KEYS[1] generation, KEYS[2] cache entry; ARGV[1] generation seen before the database read
 * ('' = none), ARGV[2] entry, ARGV[3] TTL in seconds. Sets the entry only if no change
 * happened since.
 */
const CACHE_SET_IF_GENERATION = `
if (redis.call('GET', KEYS[1]) or '') == ARGV[1] then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[3]))
  return 1
end
return 0`;

type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** What the cache holds: the validated value, or that the registry default applies. */
type CacheEntry = { value: number | boolean } | { default: true };

export interface SettingState<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue<K>;
  /** True when no admin has set a value, or the stored one is no longer valid. */
  isDefault: boolean;
}

/**
 * App settings (task 1.12). Values come from the `AppSetting` table, are validated against the
 * hard bounds in the `@guesshive/shared` registry, and are cached in Redis so all api instances
 * share them. Without a valid stored value, the registry default applies. When Redis is down,
 * values are read from the database directly; when the database fails too, the error is thrown
 * (a security-relevant value such as the password length is never guessed).
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  /** While set and in the future, Redis is skipped (it just failed). */
  private redisRetryAt: number | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** The current value of a setting. */
  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return (await this.state(key)).value;
  }

  /** Every registered setting with its current value (admin panel). */
  getAll(): Promise<SettingState[]> {
    return Promise.all(SETTING_KEYS.map((key) => this.state(key)));
  }

  /** A setting's value and whether it is the default. */
  async state<K extends SettingKey>(key: K): Promise<SettingState<K>> {
    this.assertKey(key);
    const cached = await this.cacheGet(key);
    if (cached) {
      // Cached entries are validated again, so a value written to Redis by hand cannot
      // bypass the bounds; an invalid one is treated as a miss.
      const state = this.fromEntry(key, cached);
      if (state) {
        return state;
      }
    }
    const generation = await this.cacheGeneration(key);
    const row = await this.prisma.appSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    let entry: CacheEntry = { default: true };
    if (row) {
      const value = parseSettingValue(key, row.value);
      if (value === undefined) {
        // Stored value outside today's bounds (bounds tightened, or edited by hand). Logged
        // once per cache window, since the default is cached for it.
        this.logger.warn(`Ignoring invalid stored value of setting ${key}`);
      } else {
        entry = { value };
      }
    }
    await this.cacheSet(key, entry, generation);
    return this.fromEntry(key, entry) ?? this.defaultState(key);
  }

  /**
   * Changes a setting (admin panel, task 4.15b). The value must pass the registry's type and
   * hard bounds; old and new value go to the audit log in the same transaction. `actorId` is
   * the signed-in admin from the session, never from the request body.
   */
  async update(key: SettingKey, value: unknown, actorId: string): Promise<void> {
    this.assertKey(key);
    const parsed = parseSettingValue(key, value);
    if (parsed === undefined) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Invalid setting value');
    }
    await this.write(key, actorId, 'app_setting.update', async (tx) => {
      await tx.appSetting.upsert({
        where: { key },
        update: { value: parsed, updatedById: actorId },
        create: { key, value: parsed, updatedById: actorId },
      });
      return parsed;
    });
  }

  /** Back to the registry default ("terug naar standaard"): removes the stored value. */
  async reset(key: SettingKey, actorId: string): Promise<void> {
    this.assertKey(key);
    await this.write(key, actorId, 'app_setting.reset', async (tx) => {
      await tx.appSetting.deleteMany({ where: { key } });
      return null;
    });
  }

  private assertKey(key: string): asserts key is SettingKey {
    if (!isSettingKey(key)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown setting');
    }
  }

  /**
   * Runs a change in a transaction with a per-key advisory lock (so each audit entry's "from"
   * is right) and audits old → new (`null` = default). Afterwards it bumps the key's change
   * counter, so a read that started before the change does not cache the old value, and drops
   * the cached value.
   */
  private async write(
    key: SettingKey,
    actorId: string,
    action: 'app_setting.update' | 'app_setting.reset',
    change: (tx: PrismaTx) => Promise<number | boolean | null>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`app_setting:${key}`}))`;
      const previous = await tx.appSetting.findUnique({ where: { key }, select: { value: true } });
      const to = await change(tx);
      await tx.auditLog.create({
        data: {
          actorId,
          action,
          targetType: 'AppSetting',
          targetId: key,
          meta: { from: previous ? previous.value : null, to },
        },
      });
    });
    // Always attempted, even inside the skip window: a reachable Redis must not keep serving
    // the old value. If it fails, cached values expire within SETTINGS_CACHE_TTL_SECONDS.
    const results = await this.redisCall(
      () =>
        this.redis
          .multi()
          .incr(SETTINGS_GENERATION_PREFIX + key)
          .del(SETTINGS_CACHE_PREFIX + key)
          .exec(),
      { force: true },
    );
    if (results === undefined || results?.some(([error]) => error !== null)) {
      this.logger.warn(`Could not clear the cached value of setting ${key}`);
    }
  }

  private fromEntry<K extends SettingKey>(key: K, entry: CacheEntry): SettingState<K> | undefined {
    if ('default' in entry) {
      return this.defaultState(key);
    }
    const value = parseSettingValue(key, entry.value);
    return value === undefined ? undefined : { key, value, isDefault: false };
  }

  private defaultState<K extends SettingKey>(key: K): SettingState<K> {
    return { key, value: settingDefinition(key).default as SettingValue<K>, isDefault: true };
  }

  private async cacheGet(key: SettingKey): Promise<CacheEntry | undefined> {
    const raw = await this.redisCall(() => this.redis.get(SETTINGS_CACHE_PREFIX + key));
    if (!raw) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        if ('default' in parsed && parsed.default === true) {
          return { default: true };
        }
        if (
          'value' in parsed &&
          (typeof parsed.value === 'number' || typeof parsed.value === 'boolean')
        ) {
          return { value: parsed.value };
        }
      }
    } catch {
      // Unreadable entry: treated as a miss and overwritten.
    }
    return undefined;
  }

  private async cacheGeneration(key: SettingKey): Promise<string | null | undefined> {
    return this.redisCall(() => this.redis.get(SETTINGS_GENERATION_PREFIX + key));
  }

  /** Caches an entry, unless a change happened since `generation` was read. */
  private async cacheSet(
    key: SettingKey,
    entry: CacheEntry,
    generation: string | null | undefined,
  ): Promise<void> {
    if (generation === undefined) {
      return;
    }
    // Compare-and-set in one atomic step, so a change cannot land between the check and SET.
    await this.redisCall(() =>
      this.redis.eval(
        CACHE_SET_IF_GENERATION,
        2,
        SETTINGS_GENERATION_PREFIX + key,
        SETTINGS_CACHE_PREFIX + key,
        generation ?? '',
        JSON.stringify(entry),
        String(SETTINGS_CACHE_TTL_SECONDS),
      ),
    );
  }

  /**
   * Runs a Redis call; on failure returns `undefined`, logs once (no details: they can hold
   * connection info) and skips Redis for SETTINGS_REDIS_RETRY_MS, so an unreachable Redis does
   * not add its timeout to every read.
   */
  private async redisCall<T>(
    call: () => Promise<T>,
    options: { force?: boolean } = {},
  ): Promise<T | undefined> {
    if (!options.force && this.redisRetryAt !== undefined && Date.now() < this.redisRetryAt) {
      return undefined;
    }
    try {
      const result = await call();
      if (this.redisRetryAt !== undefined) {
        this.redisRetryAt = undefined;
        this.logger.log('Settings cache available again');
      }
      return result;
    } catch {
      if (this.redisRetryAt === undefined) {
        this.logger.warn('Settings cache unavailable; reading settings from the database');
      }
      this.redisRetryAt = Date.now() + SETTINGS_REDIS_RETRY_MS;
      return undefined;
    }
  }
}
