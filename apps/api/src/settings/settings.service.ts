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
/**
 * How long a cached value lives. A change deletes the cached value at once; this bound only
 * limits how long a rare race (a read that started before the change) can serve the old value.
 */
export const SETTINGS_CACHE_TTL_SECONDS = 60;

/** Marker for "no row in the database": the registry default applies. */
const DEFAULT_MARKER = '{"default":true}';

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
 * values are read from the database directly; when both fail, the error is thrown (callers
 * should not silently guess a security-relevant value such as the password length).
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private redisFailing = false;

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
    if (!isSettingKey(key)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown setting');
    }
    const cached = await this.cacheGet(key);
    if (cached !== undefined) {
      const state = this.resolve(key, cached);
      if (state) {
        return state;
      }
    }
    const row = await this.prisma.appSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const raw = row ? JSON.stringify(row.value) : DEFAULT_MARKER;
    await this.cacheSet(key, raw);
    return this.resolve(key, raw) ?? this.defaultState(key);
  }

  /**
   * Changes a setting (admin panel, task 4.15b). The value must pass the registry's type and
   * hard bounds; old and new value go to the audit log in the same transaction.
   */
  async update(key: SettingKey, value: unknown, actorId: string): Promise<void> {
    const parsed = this.parseOrThrow(key, value);
    await this.write(key, actorId, async (tx) => {
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
    if (!isSettingKey(key)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown setting');
    }
    await this.write(key, actorId, async (tx) => {
      await tx.appSetting.deleteMany({ where: { key } });
      return null;
    });
  }

  private parseOrThrow(key: SettingKey, value: unknown): number | boolean {
    if (!isSettingKey(key)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown setting');
    }
    const parsed = parseSettingValue(key, value);
    if (parsed === undefined) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Invalid setting value');
    }
    return parsed;
  }

  /**
   * Runs a change in a transaction with a per-key advisory lock (so each audit entry's "from"
   * is right), audits old → new (`null` = default), then drops the cached value.
   */
  private async write(
    key: SettingKey,
    actorId: string,
    change: (
      tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ) => Promise<number | boolean | null>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`app_setting:${key}`}))`;
      const previous = await tx.appSetting.findUnique({ where: { key }, select: { value: true } });
      const to = await change(tx);
      const from = previous ? previous.value : null;
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'app_setting.update',
          targetType: 'AppSetting',
          targetId: key,
          meta: { from, to },
        },
      });
    });
    await this.cacheDelete(key);
  }

  private resolve<K extends SettingKey>(key: K, raw: string): SettingState<K> | undefined {
    if (raw === DEFAULT_MARKER) {
      return this.defaultState(key);
    }
    let stored: unknown;
    try {
      stored = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const value = parseSettingValue(key, stored);
    if (value === undefined) {
      // A stored value outside today's bounds (bounds tightened, or edited by hand).
      this.logger.warn(`Ignoring invalid stored value of setting ${key}`);
      return this.defaultState(key);
    }
    return { key, value, isDefault: false };
  }

  private defaultState<K extends SettingKey>(key: K): SettingState<K> {
    return { key, value: settingDefinition(key).default as SettingValue<K>, isDefault: true };
  }

  private async cacheGet(key: SettingKey): Promise<string | undefined> {
    try {
      const value = await this.redis.get(SETTINGS_CACHE_PREFIX + key);
      this.redisRecovered();
      return value ?? undefined;
    } catch {
      this.redisFailed();
      return undefined;
    }
  }

  private async cacheSet(key: SettingKey, raw: string): Promise<void> {
    try {
      await this.redis.set(SETTINGS_CACHE_PREFIX + key, raw, 'EX', SETTINGS_CACHE_TTL_SECONDS);
    } catch {
      this.redisFailed();
    }
  }

  private async cacheDelete(key: SettingKey): Promise<void> {
    try {
      await this.redis.del(SETTINGS_CACHE_PREFIX + key);
    } catch {
      // The cached value then expires within SETTINGS_CACHE_TTL_SECONDS.
      this.redisFailed();
    }
  }

  /** Logs once per Redis outage, without error details (they can hold connection info). */
  private redisFailed(): void {
    if (!this.redisFailing) {
      this.redisFailing = true;
      this.logger.warn('Settings cache unavailable; reading settings from the database');
    }
  }

  private redisRecovered(): void {
    this.redisFailing = false;
  }
}
