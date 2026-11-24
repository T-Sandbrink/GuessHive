import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { ApiException } from '../common/api.exception.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { throttled } from '../redis/redis-errors.js';
import { hashIp } from './ip-hash.js';
import { ROUTE_RATE_LIMIT, type RouteRateLimit } from './rate-limit.decorator.js';
import { RateLimitStorageUnavailableError } from './redis-throttler.storage.js';

/** The signed-in user's id, once auth (phase 2) puts a user on the request. */
function userIdOf(req: Record<string, unknown>): string | undefined {
  const user = req['user'];
  if (typeof user === 'object' && user !== null && 'id' in user && typeof user.id === 'string') {
    return user.id;
  }
  return undefined;
}

/**
 * Global guard (task 1.9). Counts signed-in users by user id and guests by a keyed hash of
 * their IP (never the raw IP). When Redis is down, requests go through and the outage is
 * logged, except on routes with `@RateLimit({ failClosed: true })`, which answer 503 (owner
 * decision 2026-11-24).
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  private readonly warnUnavailable: (message: string) => void;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {
    super(options, storage, reflector);
    const logger = new Logger('RateLimit');
    this.warnUnavailable = throttled((message) => {
      logger.warn(message);
    });
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = userIdOf(req);
    if (userId !== undefined) {
      return Promise.resolve(`user:${userId}`);
    }
    // Express sets `req.ip` to the socket address (no `trust proxy` yet; see PLAN.md 3.4).
    const ip = typeof req['ip'] === 'string' && req['ip'] !== '' ? req['ip'] : 'unknown';
    return Promise.resolve(`ip:${hashIp(this.env.IP_HASH_SECRET, ip)}`);
  }

  /** Also sends the standard `Retry-After` next to the per-throttler `Retry-After-<name>`. */
  protected override setResponseHeader(
    res: Record<string, unknown>,
    name: string,
    value: string | number,
  ): void {
    super.setResponseHeader(res, name, value);
    if (name.startsWith('Retry-After-')) {
      super.setResponseHeader(res, 'Retry-After', value);
    }
  }

  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (!(error instanceof RateLimitStorageUnavailableError)) {
        throw error;
      }
      const { context } = requestProps;
      const failClosed =
        this.reflector.getAllAndOverride<RouteRateLimit | undefined>(ROUTE_RATE_LIMIT, [
          context.getHandler(),
          context.getClass(),
        ])?.failClosed === true;
      this.warnUnavailable(
        `Rate-limit storage unavailable (${error.code}); ${failClosed ? 'refusing' : 'allowing'} requests`,
      );
      if (failClosed) {
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'SERVICE_UNAVAILABLE',
          'Service unavailable',
        );
      }
      return true;
    }
  }
}
