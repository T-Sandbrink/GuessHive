import {
  HttpException,
  HttpStatus,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import type { ApiErrorBody, ApiValidationIssue } from '@guesshive/shared';

/** The issues a Standard Schema validator reports (from `@standard-schema/spec`). */
type SchemaIssues = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0];

/** At most this many issues go into one response; a huge invalid body cannot inflate the reply. */
export const MAX_VALIDATION_ISSUES = 20;
/** Longer path keys (e.g. user-chosen record keys) are cut to this length. */
export const MAX_PATH_KEY_LENGTH = 64;
/** At most this many segments per path; deeper paths are cut. */
export const MAX_PATH_DEPTH = 16;

/** zod issue codes look like `invalid_type`; anything else is reported as `invalid`. */
const ISSUE_CODE_PATTERN = /^[a-z][a-z_]{0,39}$/;

function toPathSegment(segment: unknown): string | number {
  const key: unknown =
    typeof segment === 'object' && segment !== null && 'key' in segment ? segment.key : segment;
  if (typeof key === 'number' && Number.isFinite(key)) {
    return key;
  }
  return String(key).slice(0, MAX_PATH_KEY_LENGTH);
}

function toIssueCode(issue: object): string {
  const code = 'code' in issue ? issue.code : undefined;
  return typeof code === 'string' && ISSUE_CODE_PATTERN.test(code) ? code : 'invalid';
}

/**
 * Keeps only where each check failed and what kind of check it was (ADR 0003). The issue
 * `message` is dropped: validators may quote the submitted value in it (AGENTS.md §7).
 */
export function toValidationIssues(issues: SchemaIssues): ApiValidationIssue[] {
  return issues.slice(0, MAX_VALIDATION_ISSUES).map((issue) => ({
    path: (issue.path ?? []).slice(0, MAX_PATH_DEPTH).map(toPathSegment),
    code: toIssueCode(issue),
  }));
}

/** A request that failed schema validation: `400 { code: 'VALIDATION_FAILED', message, issues }`. */
export class ValidationFailedException extends HttpException {
  constructor(readonly issues: ApiValidationIssue[]) {
    super(
      {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        issues,
      } satisfies ApiErrorBody,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * The global pipe: validates every `@Body`, `@Param` and `@Query` that declares a `schema`
 * (zod schemas from `@guesshive/shared`) and passes the parsed value on. Parameters without a
 * schema are left untouched.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new ValidationFailedException(toValidationIssues(issues)),
  });
}
