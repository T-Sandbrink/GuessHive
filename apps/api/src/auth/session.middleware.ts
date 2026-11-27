import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Response } from 'express';
import { AUTH_BASE_PATH, type Auth } from './auth.config.js';
import { AUTH } from './auth.constants.js';
import type { AuthenticatedRequest, RequestUser, UserRole, UserStatus } from './request-user.js';

const ROLES: readonly string[] = ['USER', 'MODERATOR', 'ADMIN'] satisfies UserRole[];
const STATUSES: readonly string[] = ['ACTIVE', 'SUSPENDED', 'BANNED'] satisfies UserStatus[];
const UNAUTHORIZED = 401;

/** True when the request carries a Better Auth session cookie (any prefix variant). */
function hasSessionCookie(cookieHeader: string | undefined): boolean {
  return cookieHeader?.includes('.session_token=') === true;
}

/** True for Better Auth's own routes (Express routing ignores case, so this does too). */
export function isAuthPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === AUTH_BASE_PATH || lower.startsWith(`${AUTH_BASE_PATH}/`);
}

/**
 * Resolves the session cookie into `req.user` and `req.authSession` before any guard runs, so
 * rate limits count signed-in users by id (review 1.9) and the auth guard (task 2.8) can decide.
 * Guests and invalid, expired or just-revoked sessions leave both unset; the auth routes resolve
 * the session themselves.
 *
 * It never refreshes the session: a refresh here would extend the database row but drop the new
 * cookie. The web app keeps sessions alive through `/api/auth/get-session` (phase 3), which
 * returns the refreshed cookie.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    if (!hasSessionCookie(req.headers.cookie) || isAuthPath(req.path)) {
      next();
      return;
    }
    try {
      const result = await this.auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
        query: { disableRefresh: true },
      });
      if (result !== null) {
        const user = toRequestUser(result.user);
        if (user !== undefined) {
          req.user = user;
          req.authSession = { id: result.session.id, expiresAt: result.session.expiresAt };
        }
      }
      next();
    } catch (error) {
      // Defensive (refresh is disabled, which avoids the usual 401 path): a session revoked
      // between lookup and use is a guest, not a server error. Anything else (database down)
      // goes to the exception filter.
      if (isAPIError(error) && error.statusCode === UNAUTHORIZED) {
        next();
        return;
      }
      next(error);
    }
  }
}

/** Narrows Better Auth's user object to the fields guards rely on; undefined when malformed. */
export function toRequestUser(user: Record<string, unknown>): RequestUser | undefined {
  const { id, role, status, emailVerified } = user;
  if (
    typeof id !== 'string' ||
    typeof role !== 'string' ||
    !ROLES.includes(role) ||
    typeof status !== 'string' ||
    !STATUSES.includes(status)
  ) {
    return undefined;
  }
  return {
    id,
    role: role as UserRole,
    status: status as UserStatus,
    emailVerified: emailVerified === true,
  };
}
