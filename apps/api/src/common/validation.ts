import {
  type ArgumentMetadata,
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
  type ValidationIssueLocation,
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
 * caps keep a huge invalid body from inflating the reply. `name` is the argument name of a
 * decorator such as `@Param('id', { schema })`, and becomes the first path segment.
 */
export function toValidationIssues(
  issues: SchemaIssues,
  location: ValidationIssueLocation,
  name?: string,
): ApiValidationIssue[] {
  const prefix = name === undefined ? [] : [name];
  return issues.slice(0, VALIDATION_ISSUE_LIMITS.maxIssues).map((issue) => ({
    location,
    path: [...prefix, ...(issue.path ?? [])]
      .slice(0, VALIDATION_ISSUE_LIMITS.maxPathDepth)
      .map(toPathSegment),
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

const LOCATION_BY_TYPE = {
  body: 'body',
  query: 'query',
  param: 'params',
} as const satisfies Record<Exclude<ArgumentMetadata['type'], 'custom'>, ValidationIssueLocation>;

/** Carries the raw issues from the exception factory to `transform`, which knows the location. */
class SchemaIssuesError extends Error {
  constructor(readonly issues: SchemaIssues) {
    super('Schema validation failed');
  }
}

/**
 * Adds the request location to the issues. The base pipe's exception factory only receives the
 * issues, so it throws them in a `SchemaIssuesError` and `transform` wraps them here. Custom
 * decorators are never validated (`validateCustomDecorators` stays off).
 */
class ApiValidationPipe extends StandardSchemaValidationPipe {
  constructor() {
    super({ exceptionFactory: (issues) => new SchemaIssuesError(issues) });
  }

  override async transform<T = unknown>(value: T, metadata: ArgumentMetadata): Promise<T> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (error instanceof SchemaIssuesError && metadata.type !== 'custom') {
        throw new ValidationFailedException(
          toValidationIssues(error.issues, LOCATION_BY_TYPE[metadata.type], metadata.data),
        );
      }
      throw error;
    }
  }
}

/**
 * The global pipe: validates every `@Body`, `@Param` and `@Query` that declares a `schema`
 * (zod schemas from `@guesshive/shared`) and passes the parsed value on. The pipe itself skips
 * arguments without a schema; test/route-schemas.e2e-spec.ts fails the build when one exists.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new ApiValidationPipe();
}
