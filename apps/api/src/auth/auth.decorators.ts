import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './request-user.js';

/** Metadata key of `@Public()`. */
export const IS_PUBLIC_KEY = 'auth:isPublic';
/** Metadata key of `@AllowRestricted()`. */
export const ALLOW_RESTRICTED_KEY = 'auth:allowRestricted';
/** Metadata key of `@Roles()`. */
export const ROLES_KEY = 'auth:roles';

/**
 * Opts a controller or handler out of the global AuthGuard (task 2.8): guests may call it.
 * Every other route needs a signed-in, active user (default deny, AGENTS.md §8). On a controller
 * it covers every handler and cannot be undone per handler: put protected routes elsewhere.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Lets suspended and banned users (still signed in) call this route (task 2.8), for what they
 * keep a right to: their moderation notices and appeal (DSA), data export and account deletion
 * (GDPR), and their own status. Which routes, and whether banned users may sign in at all, is an
 * open owner question ("Geschorste en verbannen gebruikers", PLAN.md); no route uses it yet.
 */
export const AllowRestricted = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_RESTRICTED_KEY, true);

/**
 * Limits a controller or handler to the listed roles (task 2.8), e.g. `@Roles('ADMIN')`. There is
 * no implied hierarchy: list every role that may call it (`@Roles('MODERATOR', 'ADMIN')`). A
 * handler's `@Roles` replaces its controller's.
 */
export const Roles = (...roles: [UserRole, ...UserRole[]]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
