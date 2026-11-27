import type { Request } from 'express';

/** Role and status as stored on `User` (Prisma enums `Role` and `UserStatus`). */
export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN';

/** Account status (Prisma enum `UserStatus`). */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

/**
 * The signed-in user that SessionMiddleware puts on `req.user` before any guard runs (task 2.1).
 * Only what guards need: authorization reads the database, not the cookie.
 */
export interface RequestUser {
  id: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
}

/** The current session (`req.authSession`), without its token. */
export interface RequestSession {
  id: string;
  expiresAt: Date;
}

/** An Express request after SessionMiddleware: both fields are absent for guests. */
export type AuthenticatedRequest = Request & {
  user?: RequestUser;
  authSession?: RequestSession;
};
