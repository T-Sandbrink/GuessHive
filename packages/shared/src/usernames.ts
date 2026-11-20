/**
 * Characters a username may contain: ASCII letters, digits, `_` and `.` (owner decision,
 * 2026-11-20). ASCII only, so lowercasing gives the same result in JavaScript and in every
 * Postgres locale, and look-alike duplicates cannot exist. The database enforces the same rule
 * with a CHECK on `User.displayUsername`. Length limits follow with onboarding (task 2.11).
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;

/**
 * The unique, case-insensitive form stored in `User.username`, derived from the spelling the
 * user chose (`User.displayUsername`). Always write both columns together through this function.
 */
export function normalizeUsername(displayUsername: string): string {
  return displayUsername.toLowerCase();
}
