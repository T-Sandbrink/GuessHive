const DAY_SECONDS = 24 * 60 * 60;

/**
 * How long a session lasts without use (task 2.7). DRAFT value: PLAN.md open question
 * "Hoe lang blijf je ingelogd?". A `/api/auth/get-session` call (made by the web app, phase 3)
 * pushes the expiry out again (sliding), at most once per SESSION_REFRESH_SECONDS, so someone who
 * votes now and then stays signed in. Other requests never refresh (SessionMiddleware).
 */
export const SESSION_TTL_SECONDS = 30 * DAY_SECONDS;

/** How often an active session's expiry is pushed out (at most one write per day per session). */
export const SESSION_REFRESH_SECONDS = DAY_SECONDS;

/**
 * A session counts as fresh this long after sign-in; Better Auth asks for a fresh session on
 * sensitive endpoints. Its default, pinned so an upgrade cannot change it silently.
 */
export const SESSION_FRESH_AGE_SECONDS = DAY_SECONDS;

/**
 * Attributes of every Better Auth cookie, the session cookie included (AGENTS.md §8). Better Auth
 * already defaults to these; stated here
 * so an upgrade cannot change them silently. `Secure` follows `useSecureCookies`
 * (production, or any https origin).
 */
export const SESSION_COOKIE_ATTRIBUTES = { httpOnly: true, sameSite: 'lax', path: '/' } as const;
