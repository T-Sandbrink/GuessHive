import { z } from 'zod';

/**
 * Machine-readable error codes in every api error body (`{ code, message }`, AGENTS.md §7).
 * The web app maps a code to a translated message; `message` is English and for developers only.
 * Domain modules add their own codes here (e.g. `VOTE_ALREADY_CAST`).
 */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  /** Signed in, but the account is suspended (task 2.8). */
  'ACCOUNT_SUSPENDED',
  /** Signed in, but the account is banned (task 2.8). */
  'ACCOUNT_BANNED',
  /** Sign-up or magic-link request without a Turnstile token (task 2.9). */
  'TURNSTILE_REQUIRED',
  /** The Turnstile token was refused (invalid, expired, reused, wrong host or action; task 2.9). */
  'TURNSTILE_FAILED',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Bounds on `issues` in a `VALIDATION_FAILED` response; the api enforces the same ones. */
export const VALIDATION_ISSUE_LIMITS = {
  /** Issues per response. */
  maxIssues: 20,
  /** Segments per path. */
  maxPathDepth: 16,
} as const;

/**
 * A path segment the api reports as is: a schema field name. Any other key (for example a
 * user-chosen `z.record` key, which is submitted data) is reported as `*`.
 */
export const VALIDATION_PATH_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
/** The placeholder for a path key that is not a schema field name. */
export const VALIDATION_PATH_PLACEHOLDER = '*';
/** Issue codes look like zod's `invalid_type`; anything else is reported as `invalid`. */
export const VALIDATION_ISSUE_CODE_PATTERN = /^[a-z][a-z_]{0,39}$/;

/** Which part of the request a validation issue is about. */
export const VALIDATION_ISSUE_LOCATIONS = ['body', 'query', 'params'] as const;

export type ValidationIssueLocation = (typeof VALIDATION_ISSUE_LOCATIONS)[number];

/**
 * One failed check in a `VALIDATION_FAILED` response (ADR 0003): which part of the request
 * (`location`), where in it (`path`; for a single named argument such as `@Param('id')`,
 * `@Query('limit')` or `@Body('title')`, it starts with that name) and what
 * kind of check it was (e.g. zod's `invalid_type`, `too_small`). Never the submitted value.
 */
export const apiValidationIssueSchema = z.object({
  location: z.enum(VALIDATION_ISSUE_LOCATIONS),
  path: z
    .array(
      z.union([
        z.string().regex(VALIDATION_PATH_KEY_PATTERN),
        z.literal(VALIDATION_PATH_PLACEHOLDER),
        z.number().int().nonnegative(),
      ]),
    )
    .max(VALIDATION_ISSUE_LIMITS.maxPathDepth),
  code: z.string().regex(VALIDATION_ISSUE_CODE_PATTERN),
});

export type ApiValidationIssue = z.infer<typeof apiValidationIssueSchema>;

/**
 * The JSON body of every api error response; the web app validates it at the boundary.
 * `issues` is only present on `VALIDATION_FAILED` responses from request validation; a
 * `VALIDATION_FAILED` from elsewhere (e.g. a 422) has none.
 */
export const apiErrorBodySchema = z.object({
  code: z.enum(API_ERROR_CODES),
  message: z.string(),
  issues: z.array(apiValidationIssueSchema).max(VALIDATION_ISSUE_LIMITS.maxIssues).optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
