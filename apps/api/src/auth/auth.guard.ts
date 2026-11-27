import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/api.exception.js';
import { ALLOW_RESTRICTED_KEY, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators.js';
import type { AuthenticatedRequest, RequestUser, UserRole } from './request-user.js';

/**
 * The request's user, or 401. Only http is supported: any other context (a future WebSocket
 * gateway or RPC transport) is refused until the guards get their own branch for it, so a new
 * transport can never be open by accident (security review 2.8). RateLimitGuard, which runs
 * first, also assumes http: a new transport needs a branch there too.
 */
function signedInUser(context: ExecutionContext): RequestUser {
  if (context.getType() !== 'http') {
    throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Forbidden');
  }
  const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (user === undefined) {
    throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Sign in required');
  }
  return user;
}

/** 403 with the account's own code for a suspended or banned user; nothing for an active one. */
function refuseRestricted(user: RequestUser): void {
  if (user.status === 'SUSPENDED') {
    throw new ApiException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Account suspended');
  }
  if (user.status === 'BANNED') {
    throw new ApiException(HttpStatus.FORBIDDEN, 'ACCOUNT_BANNED', 'Account banned');
  }
}

/**
 * Global guard (task 2.8): every route needs a signed-in user with status `ACTIVE`, unless it is
 * marked `@Public()`. SessionMiddleware has already put the user on the request (role and status
 * read from the database on every request). Suspended and banned users get 403 with their own
 * code, so the web app can explain it (DSA), except on `@AllowRestricted()` routes. They can still
 * sign out, because the auth routes are public and Better Auth checks their sessions itself.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) {
      if (context.getType() !== 'http') {
        throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Forbidden');
      }
      return true;
    }
    const user = signedInUser(context);
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_RESTRICTED_KEY, targets) !== true
    ) {
      refuseRestricted(user);
    }
    return true;
  }
}

/**
 * Global guard after AuthGuard (task 2.8): a route with `@Roles(...)` only lets those roles in
 * (403 otherwise). Routes without `@Roles` are open to every signed-in user. `@Roles` on a public
 * or `@AllowRestricted()` route still needs a signed-in, active user with one of the roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<readonly UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles === undefined) {
      return true;
    }
    const user = signedInUser(context);
    refuseRestricted(user);
    if (!roles.includes(user.role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Forbidden');
    }
    return true;
  }
}
