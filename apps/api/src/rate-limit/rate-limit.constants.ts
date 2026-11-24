/**
 * Rate limiting (task 1.9, owner decision 2026-11-24): every client gets at most 120 requests a
 * minute across the whole api (signed-in users by user id, guests by IP hash). Routes can add a
 * stricter limit of their own with `@RateLimit()`.
 */
export const GLOBAL_RATE_LIMIT = { limit: 120, ttlMs: 60_000 } as const;

/** Throttler names: `global` applies to every route, `route` only where `@RateLimit()` is set. */
export const THROTTLERS = { global: 'global', route: 'route' } as const;

/** Prefix of every rate-limit key in Redis. */
export const RATE_LIMIT_KEY_PREFIX = 'gh:rl';
