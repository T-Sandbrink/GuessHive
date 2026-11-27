import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import {
  PASSWORD_FIELDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH_FLOOR,
  type PasswordSettings,
  passwordPolicyHook,
} from './password-policy.js';

type HookContext = { path: string; body?: unknown };

/** The hook as a plain function: Better Auth calls it with the endpoint context. */
function hookWith(minLength: number) {
  const get = vi.fn().mockResolvedValue(minLength);
  const settings = { get } as unknown as PasswordSettings;
  const hook = passwordPolicyHook(settings) as unknown as (ctx: HookContext) => Promise<unknown>;
  return { hook, get };
}

/** The APIError a call rejects with, or undefined when it resolves. */
async function errorOf(promise: Promise<unknown>): Promise<APIError | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(APIError);
    return error as APIError;
  }
}

describe('password policy hook (task 2.2)', () => {
  it('uses the registry bounds: floor 8, max 128', () => {
    expect(PASSWORD_MIN_LENGTH_FLOOR).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it('checks exactly sign-up, reset and change password, with their password field', () => {
    expect(Object.fromEntries(PASSWORD_FIELDS)).toEqual({
      '/sign-up/email': 'password',
      '/reset-password': 'newPassword',
      '/change-password': 'newPassword',
    });
  });

  it.each([
    ['/sign-up/email', 'password'],
    ['/reset-password', 'newPassword'],
    ['/change-password', 'newPassword'],
  ])('rejects a too short %s %s with 400 PASSWORD_TOO_SHORT', async (path, field) => {
    const { hook, get } = hookWith(12);
    const error = await errorOf(hook({ path, body: { [field]: 'x'.repeat(11) } }));
    expect(get).toHaveBeenCalledWith('auth.passwordMinLength');
    expect(error?.statusCode).toBe(400);
    expect(error?.status).toBe('BAD_REQUEST');
    expect(error?.body).toMatchObject({ code: 'PASSWORD_TOO_SHORT', minLength: 12 });
  });

  it.each([
    ['/sign-up/email', 'password'],
    ['/reset-password', 'newPassword'],
  ])('accepts %s %s at exactly the minimum length, unchanged', async (path, field) => {
    const { hook } = hookWith(12);
    await expect(hook({ path, body: { [field]: 'x'.repeat(12) } })).resolves.toBeUndefined();
  });

  it.each([undefined, false, true, 'false'])(
    'accepts /change-password at the minimum length and forces revokeOtherSessions (sent %j)',
    async (revokeOtherSessions) => {
      const { hook } = hookWith(12);
      const body = { currentPassword: 'old-password-123', newPassword: 'x'.repeat(12) };
      await expect(
        hook({ path: '/change-password', body: { ...body, revokeOtherSessions } }),
      ).resolves.toEqual({ context: { body: { ...body, revokeOtherSessions: true } } });
    },
  );

  it('does not force revokeOtherSessions on other paths', async () => {
    const { hook } = hookWith(12);
    await expect(
      hook({
        path: '/reset-password',
        body: { newPassword: 'x'.repeat(12), revokeOtherSessions: false },
      }),
    ).resolves.toBeUndefined();
  });

  it('never echoes the password in the error', async () => {
    const { hook } = hookWith(12);
    const error = await errorOf(hook({ path: '/sign-up/email', body: { password: 'hunter2-pw' } }));
    expect(JSON.stringify(error?.body)).not.toContain('hunter2-pw');
    expect(error?.message).not.toContain('hunter2-pw');
  });

  it('checks the field of the path, not another field', async () => {
    const { hook } = hookWith(12);
    // On reset the short value sits in newPassword; a long `password` does not help.
    expect(
      await errorOf(
        hook({ path: '/reset-password', body: { password: 'x'.repeat(40), newPassword: 'short' } }),
      ),
    ).toBeDefined();
    // On sign-up only `password` counts.
    await expect(
      hook({ path: '/sign-up/email', body: { password: 'x'.repeat(12), newPassword: 'short' } }),
    ).resolves.toBeUndefined();
  });

  it('uses the current setting value', async () => {
    const strict = hookWith(20);
    expect(
      await errorOf(strict.hook({ path: '/sign-up/email', body: { password: 'x'.repeat(19) } })),
    ).toMatchObject({ body: { minLength: 20 } });
    const relaxed = hookWith(8);
    await expect(
      relaxed.hook({ path: '/sign-up/email', body: { password: 'x'.repeat(8) } }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['a number', 12345678901234],
    ['an array', ['x'.repeat(20)]],
    ['null', null],
    ['missing', undefined],
  ])('leaves a password that is %s to Better Auth', async (_label, value) => {
    const { hook, get } = hookWith(12);
    await expect(
      hook({ path: '/sign-up/email', body: { password: value } }),
    ).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'password=short', 42])(
    'leaves a body that is %j to Better Auth',
    async (body) => {
      const { hook, get } = hookWith(12);
      await expect(hook({ path: '/sign-up/email', body })).resolves.toBeUndefined();
      expect(get).not.toHaveBeenCalled();
    },
  );

  it.each(['/sign-in/email', '/request-password-reset', '/sign-out', '/sign-up/emailx', '/'])(
    'ignores %s, without reading the setting',
    async (path) => {
      const { hook, get } = hookWith(64);
      await expect(
        hook({ path, body: { password: 'short', newPassword: 'short' } }),
      ).resolves.toBeUndefined();
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('does not treat inherited object keys as password paths', async () => {
    const { hook, get } = hookWith(12);
    await expect(
      hook({ path: 'constructor', body: { constructor: 'x' } }),
    ).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('fails closed when the setting cannot be read', async () => {
    const { hook, get } = hookWith(12);
    get.mockRejectedValue(new Error('database down'));
    await expect(
      hook({ path: '/sign-up/email', body: { password: 'x'.repeat(40) } }),
    ).rejects.toThrow('database down');
  });
});
