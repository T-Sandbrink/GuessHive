import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiException } from './api.exception.js';

describe('ApiException', () => {
  it('carries status, code and a { code, message } response body', () => {
    const error = new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'Already done');
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.getResponse()).toEqual({ code: 'CONFLICT', message: 'Already done' });
  });

  it('keeps the developer message as the Error message', () => {
    const error = new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Not your group');
    expect(error.message).toBe('Not your group');
  });
});
