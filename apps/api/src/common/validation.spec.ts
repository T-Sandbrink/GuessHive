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
      { path: ['title'], code: 'too_small' },
      { path: ['options', 0, 'label'], code: 'invalid_type' },
      { path: ['options'], code: 'too_small' },
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
      issues: [{ path: ['email'], code: 'invalid_format' }],
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('never echoes user-chosen record keys', async () => {
    const schema = z.object({ scores: z.record(z.string(), z.number()) });
    const error = await rejection({ scores: { 'jan@example.com': 'x' } }, schema);
    const { body } = toErrorResponse(error);
    expect(body.issues).toEqual([{ path: ['scores', '*'], code: 'invalid_type' }]);
    expect(JSON.stringify(body)).not.toContain('jan@example.com');
  });

  it('reports a non-object body at the root path', async () => {
    const error = await rejection('not json');
    expect(error.issues).toEqual([{ path: [], code: 'invalid_type' }]);
  });
});

describe('toValidationIssues', () => {
  const { maxIssues, maxPathDepth } = VALIDATION_ISSUE_LIMITS;

  it(`keeps at most ${String(maxIssues)} issues`, () => {
    const issues = Array.from({ length: 500 }, (_, i) => ({ message: 'x', path: [i] }));
    expect(toValidationIssues(issues)).toHaveLength(maxIssues);
  });

  it('cuts deep paths', () => {
    const deep = Array.from({ length: 100 }, () => 'a');
    expect(toValidationIssues([{ message: 'x', path: deep }])[0]?.path).toHaveLength(maxPathDepth);
  });

  it('replaces keys that are not field names with a placeholder', () => {
    const keys = ['k'.repeat(65), 'jan@example.com', 'has space', '', Symbol('s'), -1, 1.5, NaN];
    expect(toValidationIssues([{ message: 'x', path: keys }])[0]?.path).toEqual(
      keys.map(() => '*'),
    );
  });

  it('keeps field names and array indexes', () => {
    const path = ['title', 'k'.repeat(64), '_x9', 0, 7];
    expect(toValidationIssues([{ message: 'x', path }])[0]?.path).toEqual(path);
  });

  it('unwraps { key } path segments', () => {
    expect(toValidationIssues([{ message: 'x', path: [{ key: 'a' }, { key: 2 }] }])).toEqual([
      { path: ['a', 2], code: 'invalid' },
    ]);
  });

  it('falls back to "invalid" when a validator gives no usable code', () => {
    const issues = [
      { message: 'x', code: 'Some Message With jan@example.com' },
      { message: 'x', code: 42 },
      { message: 'x' },
    ];
    expect(toValidationIssues(issues).map((i) => i.code)).toEqual([
      'invalid',
      'invalid',
      'invalid',
    ]);
  });
});
