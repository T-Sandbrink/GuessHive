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

/**
 * One failed check in a `VALIDATION_FAILED` response (ADR 0003): where in the input it failed
 * and what kind of check it was (e.g. zod's `invalid_type`, `too_small`). Never the submitted value.
 */
export const apiValidationIssueSchema = z.object({
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
