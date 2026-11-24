import { applyDecorators, SetMetadata } from '@nestjs/common';
import { z } from 'zod';

export const ROUTE_RATE_LIMIT = Symbol('ROUTE_RATE_LIMIT');
export const FAIL_CLOSED = Symbol('RATE_LIMIT_FAIL_CLOSED');

const routeRateLimitSchema = z.object({
  /** Requests allowed per window. */
  limit: z.number().int().positive(),
  /** Window length in milliseconds. */
  ttlMs: z.number().int().positive(),
  /** How long a client stays blocked after going over the limit (default: one window). */
  blockMs: z.number().int().positive().optional(),
  /**
   * Refuse the request (503) when Redis is down instead of letting it through. Owner decision
   * 2026-11-24: only for login, sign-up and magic-link requests.
   */
  failClosed: z.boolean().optional(),
});

export type RouteRateLimit = z.infer<typeof routeRateLimitSchema>;

/**
 * A stricter limit for one route or controller, counted per client on top of the global
 * 120 requests a minute, e.g. `@RateLimit({ limit: 5, ttlMs: 60_000, failClosed: true })`.
 * Invalid options throw when the class is loaded, so a typo never silently disables a limit.
 */
export function RateLimit(options: RouteRateLimit): MethodDecorator & ClassDecorator {
  const parsed = routeRateLimitSchema.parse(options);
  return applyDecorators(
    SetMetadata(ROUTE_RATE_LIMIT, parsed),
    SetMetadata(FAIL_CLOSED, parsed.failClosed ?? false),
  );
}
