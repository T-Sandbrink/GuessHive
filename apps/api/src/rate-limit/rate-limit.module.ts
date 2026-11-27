import { type ExecutionContext, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { GLOBAL_RATE_LIMIT, THROTTLERS } from './rate-limit.constants.js';
import { ROUTE_RATE_LIMIT, type RouteRateLimit } from './rate-limit.decorator.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

const reflector = new Reflector();

/** The `@RateLimit()` options of the route (method first, then controller), if any. */
function routeLimit(context: ExecutionContext): RouteRateLimit | undefined {
  return reflector.getAllAndOverride<RouteRateLimit | undefined>(ROUTE_RATE_LIMIT, [
    context.getHandler(),
    context.getClass(),
  ]);
}

/** Holds the storage so ThrottlerModule.forRootAsync can inject it. */
@Module({ providers: [RedisThrottlerStorage], exports: [RedisThrottlerStorage] })
class RateLimitStorageModule {}

/**
 * Rate limiting (task 1.9): `@nestjs/throttler` on Redis. RateLimitGuard is registered as a
 * global guard in AppModule, before the auth guards (task 2.8). Two throttlers: `global` (120 a
 * minute per client, one counter across all routes) and `route` (only on routes with
 * `@RateLimit()`, counted per route).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RateLimitStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: THROTTLERS.global,
            limit: GLOBAL_RATE_LIMIT.limit,
            ttl: GLOBAL_RATE_LIMIT.ttlMs,
            // One counter per client for the whole api, not per route.
            generateKey: (_context, tracker) => tracker,
          },
          {
            name: THROTTLERS.route,
            skipIf: (context) => routeLimit(context) === undefined,
            limit: (context) => routeLimit(context)?.limit ?? 0,
            ttl: (context) => routeLimit(context)?.ttlMs ?? 1,
            blockDuration: (context) => {
              const options = routeLimit(context);
              return options?.blockMs ?? options?.ttlMs ?? 1;
            },
          },
        ],
      }),
    }),
  ],
})
export class RateLimitModule {}
