import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toErrorResponse } from './all-exceptions.filter.js';
import {
  createValidationPipe,
  MAX_PATH_DEPTH,
  MAX_PATH_KEY_LENGTH,
  MAX_VALIDATION_ISSUES,
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

  it('never echoes the submitted value in the response body', async () => {
    const secret = 'jan@example.com-hunter2';
    const schema = z.object({ email: z.email(), pick: z.enum(['a', 'b']) });
    const error = await rejection({ email: secret, pick: secret }, schema);
    const { status, body } = toErrorResponse(error);
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.message).toBe('Validation failed');
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it('reports a non-object body at the root path', async () => {
    const error = await rejection('not json');
    expect(error.issues).toEqual([{ path: [], code: 'invalid_type' }]);
  });
});

describe('toValidationIssues', () => {
  it(`keeps at most ${String(MAX_VALIDATION_ISSUES)} issues`, () => {
    const issues = Array.from({ length: 500 }, (_, i) => ({ message: 'x', path: [i] }));
    expect(toValidationIssues(issues)).toHaveLength(MAX_VALIDATION_ISSUES);
  });

  it('cuts long path keys and deep paths', () => {
    const longKey = 'k'.repeat(1000);
    const deep = Array.from({ length: 100 }, () => 'a');
    const [first, second] = toValidationIssues([
      { message: 'x', path: [longKey] },
      { message: 'x', path: deep },
    ]);
    expect(first?.path).toEqual(['k'.repeat(MAX_PATH_KEY_LENGTH)]);
    expect(second?.path).toHaveLength(MAX_PATH_DEPTH);
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
