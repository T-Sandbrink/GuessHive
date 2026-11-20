import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { apiErrorBodySchema, VALIDATION_ISSUE_LIMITS } from '@guesshive/shared';
import { z } from 'zod';
import { toErrorResponse } from './all-exceptions.filter.js';
import {
  createValidationPipe,
  toValidationIssues,
  ValidationFailedException,
} from './validation.js';

const bodySchema = z.object({
  title: z.string().min(3),
  options: z.array(z.object({ label: z.string() })).min(2),
});

async function validate(value: unknown, schema: z.ZodType = bodySchema): Promise<unknown> {
  return createValidationPipe().transform(value, { type: 'body', schema });
}

async function rejection(value: unknown, schema?: z.ZodType): Promise<ValidationFailedException> {
  const error: unknown = await validate(value, schema).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ValidationFailedException);
  return error as ValidationFailedException;
}

describe('validation pipe', () => {
  it('returns the parsed value when the input is valid', async () => {
    const schema = z.object({ count: z.coerce.number() });
    await expect(validate({ count: '3' }, schema)).resolves.toEqual({ count: 3 });
  });

  it('strips keys the schema does not know', async () => {
    const value = { title: 'Ajax', options: [{ label: 'a' }, { label: 'b' }], role: 'ADMIN' };
    await expect(validate(value)).resolves.toEqual({
      title: 'Ajax',
      options: [{ label: 'a' }, { label: 'b' }],
    });
  });

  it('passes parameters without a schema through untouched', async () => {
    const value = { anything: true };
    await expect(createValidationPipe().transform(value, { type: 'body' })).resolves.toBe(value);
  });

  it('reports the path and kind of every failed check', async () => {
    const error = await rejection({ title: 'Hi', options: [{ label: 7 }] });
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.issues).toEqual([
      { location: 'body', path: ['title'], code: 'too_small' },
      { location: 'body', path: ['options', 0, 'label'], code: 'invalid_type' },
      { location: 'body', path: ['options'], code: 'too_small' },
    ]);
  });

  it('never echoes the submitted value, even when the issue message quotes it', async () => {
    const secret = 'jan@example.com-hunter2';
    const schema = z.object({
      email: z.email({ error: (issue) => `bad email ${String(issue.input)}` }),
    });
    const error = await rejection({ email: secret }, schema);
    const { status, body } = toErrorResponse(error);
    expect(status).toBe(400);
    expect(body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      issues: [{ location: 'body', path: ['email'], code: 'invalid_format' }],
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('never echoes user-chosen record keys', async () => {
    const schema = z.object({ scores: z.record(z.string(), z.number()) });
    const error = await rejection({ scores: { 'jan@example.com': 'x' } }, schema);
    const { body } = toErrorResponse(error);
    expect(body.issues).toEqual([
      { location: 'body', path: ['scores', '*'], code: 'invalid_type' },
    ]);
    expect(JSON.stringify(body)).not.toContain('jan@example.com');
  });

  it('reports a non-object body at the root path', async () => {
    const error = await rejection('not json');
    expect(error.issues).toEqual([{ location: 'body', path: [], code: 'invalid_type' }]);
  });

  it('names the route param that failed', async () => {
    const error: unknown = await createValidationPipe()
      .transform('not-a-uuid', { type: 'param', data: 'id', schema: z.uuid() })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationFailedException);
    expect((error as ValidationFailedException).issues).toEqual([
      { location: 'params', path: ['id'], code: 'invalid_format' },
    ]);
  });

  it('reports query issues with the query location', async () => {
    const schema = z.object({ limit: z.coerce.number().max(50) });
    const error: unknown = await createValidationPipe()
      .transform({ limit: '500' }, { type: 'query', schema })
      .catch((e: unknown) => e);
    expect((error as ValidationFailedException).issues).toEqual([
      { location: 'query', path: ['limit'], code: 'too_big' },
    ]);
  });

  it('prefixes the path with a named body field', async () => {
    const error: unknown = await createValidationPipe()
      .transform('Hi', { type: 'body', data: 'title', schema: z.string().min(3) })
      .catch((e: unknown) => e);
    expect((error as ValidationFailedException).issues).toEqual([
      { location: 'body', path: ['title'], code: 'too_small' },
    ]);
  });

  it('leaves custom decorators unvalidated', async () => {
    const value = 'not-a-uuid';
    await expect(
      createValidationPipe().transform(value, { type: 'custom', schema: z.uuid() }),
    ).resolves.toBe(value);
  });
});

describe('toValidationIssues', () => {
  const { maxIssues, maxPathDepth } = VALIDATION_ISSUE_LIMITS;

  it(`keeps at most ${String(maxIssues)} issues`, () => {
    const issues = Array.from({ length: 500 }, (_, i) => ({ message: 'x', path: [i] }));
    expect(toValidationIssues(issues, 'body')).toHaveLength(maxIssues);
  });

  it('cuts deep paths', () => {
    const deep = Array.from({ length: 100 }, () => 'a');
    expect(toValidationIssues([{ message: 'x', path: deep }], 'body')[0]?.path).toHaveLength(
      maxPathDepth,
    );
  });

  it('replaces keys that are not field names with a placeholder', () => {
    const keys = ['k'.repeat(65), 'jan@example.com', 'has space', '', Symbol('s'), -1, 1.5, NaN];
    expect(toValidationIssues([{ message: 'x', path: keys }], 'body')[0]?.path).toEqual(
      keys.map(() => '*'),
    );
  });

  it('keeps field names and array indexes', () => {
    const path = ['title', 'k'.repeat(64), '_x9', 0, 7];
    expect(toValidationIssues([{ message: 'x', path }], 'body')[0]?.path).toEqual(path);
  });

  it('unwraps { key } path segments', () => {
    expect(
      toValidationIssues([{ message: 'x', path: [{ key: 'a' }, { key: 2 }] }], 'body'),
    ).toEqual([{ location: 'body', path: ['a', 2], code: 'invalid' }]);
  });

  it('puts the argument name first and still cuts at the maximum depth', () => {
    const deep = Array.from({ length: 100 }, () => 'a');
    const [issue] = toValidationIssues([{ message: 'x', path: deep }], 'query', 'filter');
    expect(issue?.location).toBe('query');
    expect(issue?.path[0]).toBe('filter');
    expect(issue?.path).toHaveLength(maxPathDepth);
  });

  it('replaces an argument name that is not a field name', () => {
    expect(toValidationIssues([{ message: 'x' }], 'params', 'not a name')[0]?.path).toEqual(['*']);
  });

  it('falls back to "invalid" when a validator gives no usable code', () => {
    const issues = [
      { message: 'x', code: 'Some Message With jan@example.com' },
      { message: 'x', code: 42 },
      { message: 'x' },
    ];
    expect(toValidationIssues(issues, 'body').map((i) => i.code)).toEqual([
      'invalid',
      'invalid',
      'invalid',
    ]);
  });
});
