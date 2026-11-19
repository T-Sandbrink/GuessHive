import {
  HttpException,
  HttpStatus,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import {
  type ApiValidationIssue,
  VALIDATION_ISSUE_CODE_PATTERN,
  VALIDATION_ISSUE_LIMITS,
  VALIDATION_PATH_KEY_PATTERN,
  VALIDATION_PATH_PLACEHOLDER,
} from '@guesshive/shared';

/** The issues a Standard Schema validator reports (from `@standard-schema/spec`). */
type SchemaIssues = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0];

/**
 * Array indexes stay numbers and schema field names stay as they are. Any other key is
 * submitted data (e.g. a user-chosen `z.record` key, which could be an email) and becomes `*`.
 */
function toPathSegment(segment: unknown): string | number {
  const key: unknown =
    typeof segment === 'object' && segment !== null && 'key' in segment ? segment.key : segment;
  if (typeof key === 'number' && Number.isSafeInteger(key) && key >= 0) {
    return key;
  }
  return typeof key === 'string' && VALIDATION_PATH_KEY_PATTERN.test(key)
    ? key
    : VALIDATION_PATH_PLACEHOLDER;
}

function toIssueCode(issue: object): string {
  const code = 'code' in issue ? issue.code : undefined;
  return typeof code === 'string' && VALIDATION_ISSUE_CODE_PATTERN.test(code) ? code : 'invalid';
}

/**
 * Keeps only where each check failed and what kind of check it was (ADR 0003). The issue
 * `message` is dropped: validators may quote the submitted value in it (AGENTS.md §7). The
 * caps keep a huge invalid body from inflating the reply.
 */
export function toValidationIssues(issues: SchemaIssues): ApiValidationIssue[] {
  return issues.slice(0, VALIDATION_ISSUE_LIMITS.maxIssues).map((issue) => ({
    path: (issue.path ?? []).slice(0, VALIDATION_ISSUE_LIMITS.maxPathDepth).map(toPathSegment),
    code: toIssueCode(issue),
  }));
}

/**
 * A request that failed schema validation. `AllExceptionsFilter` turns it into
 * `400 { code: 'VALIDATION_FAILED', message, issues }`.
 */
export class ValidationFailedException extends HttpException {
  constructor(readonly issues: ApiValidationIssue[]) {
    super('Validation failed', HttpStatus.BAD_REQUEST);
  }
}

/**
 * The global pipe: validates every `@Body`, `@Param` and `@Query` that declares a `schema`
 * (zod schemas from `@guesshive/shared`) and passes the parsed value on. The pipe itself skips
 * arguments without a schema; test/route-schemas.e2e-spec.ts fails the build when one exists.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new ValidationFailedException(toValidationIssues(issues)),
  });
}
