import { APIError } from 'better-auth/api';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Auth } from './auth.config.js';
import type { AuthenticatedRequest } from './request-user.js';
import { SessionMiddleware, isAuthPath, toRequestUser } from './session.middleware.js';

describe('isAuthPath (task 2.1)', () => {
  it.each([
    '/api/auth',
    '/api/auth/',
    '/api/auth/sign-up/email',
    '/api/auth/callback/apple',
    '/API/AUTH/get-session',
    '/Api/Auth',
  ])('is true for %s', (path) => {
    expect(isAuthPath(path)).toBe(true);
  });

  it.each([
    '/',
    '',
    '/api',
    '/api/authx',
    '/api/authentication',
    '/api/auth-callback',
    '/health',
    '/x/api/auth/sign-up/email',
    'api/auth/sign-up/email',
  ])('is false for %j', (path) => {
    expect(isAuthPath(path)).toBe(false);
  });
});

describe('toRequestUser (task 2.1)', () => {
  const id = '019a0000-0000-7000-8000-000000000001';
  const base = { id, role: 'USER', status: 'ACTIVE' };

  it('keeps only the fields guards rely on', () => {
    expect(
      toRequestUser({
        id,
        role: 'ADMIN',
        status: 'SUSPENDED',
        emailVerified: true,
        email: 'jan@example.com',
        name: 'bij_abcdefghjk',
      }),
    ).toEqual({ id, role: 'ADMIN', status: 'SUSPENDED', emailVerified: true });
  });

  it.each(['USER', 'MODERATOR', 'ADMIN'])('accepts role %s', (role) => {
    expect(toRequestUser({ ...base, role })?.role).toBe(role);
  });

  it.each(['ACTIVE', 'SUSPENDED', 'BANNED'])('accepts status %s', (status) => {
    expect(toRequestUser({ ...base, status })?.status).toBe(status);
  });

  it('defaults emailVerified to false', () => {
    expect(toRequestUser(base)).toEqual({ ...base, emailVerified: false });
  });

  it('treats a non-boolean emailVerified as false', () => {
    expect(toRequestUser({ ...base, emailVerified: 'true' })?.emailVerified).toBe(false);
    expect(toRequestUser({ ...base, emailVerified: 1 })?.emailVerified).toBe(false);
  });

  it.each([
    ['no id', { role: 'USER', status: 'ACTIVE' }],
    ['a numeric id', { id: 42, role: 'USER', status: 'ACTIVE' }],
    ['no role', { id, status: 'ACTIVE' }],
    ['an unknown role', { id, role: 'SUPERUSER', status: 'ACTIVE' }],
    ['a lowercase role', { id, role: 'admin', status: 'ACTIVE' }],
    ['a non-string role', { id, role: ['ADMIN'], status: 'ACTIVE' }],
    ['no status', { id, role: 'USER' }],
    ['an unknown status', { id, role: 'USER', status: 'DELETED' }],
    ['a lowercase status', { id, role: 'USER', status: 'active' }],
    ['a non-string status', { id, role: 'USER', status: 42 }],
  ])('returns undefined for %s', (_label, user) => {
    expect(toRequestUser(user)).toBeUndefined();
  });
});

describe('SessionMiddleware (task 2.1)', () => {
  const id = '019a0000-0000-7000-8000-000000000002';
  const expiresAt = new Date('2026-12-04T12:00:00Z');
  // The middleware never touches the response.
  const res = undefined as unknown as Response;

  function middleware(getSession: ReturnType<typeof vi.fn>): SessionMiddleware {
    return new SessionMiddleware({ api: { getSession } } as unknown as Auth);
  }

  /** A mocked `next` (vi.fn<NextFunction> does not fit Express's overloaded type). */
  function nextMock() {
    return vi.fn<(error?: unknown) => void>();
  }

  function run(
    mw: SessionMiddleware,
    request: AuthenticatedRequest,
    next: ReturnType<typeof nextMock>,
  ): Promise<void> {
    return mw.use(request, res, next);
  }

  function req(path: string, cookie?: string): AuthenticatedRequest {
    return {
      path,
      headers: cookie === undefined ? {} : { cookie },
    } as unknown as AuthenticatedRequest;
  }

  const validSession = {
    user: { id, role: 'USER', status: 'ACTIVE', emailVerified: false, email: 'a@b.test' },
    session: { id: 'session-1', expiresAt, token: 'secret-token' },
  };

  it('does not look up a session without a session cookie', async () => {
    const getSession = vi.fn();
    const next = nextMock();
    const request = req('/questions', 'theme=dark');
    await run(middleware(getSession), request, next);
    expect(getSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(request.user).toBeUndefined();
  });

  it('does not look up a session without any cookie header', async () => {
    const getSession = vi.fn();
    const next = nextMock();
    await run(middleware(getSession), req('/questions'), next);
    expect(getSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it.each(['/api/auth', '/api/auth/get-session', '/API/Auth/sign-in/email'])(
    'skips the auth route %s',
    async (path) => {
      const getSession = vi.fn();
      const next = nextMock();
      await run(middleware(getSession), req(path, 'guesshive.session_token=abc'), next);
      expect(getSession).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    },
  );

  it('does not treat a look-alike path as an auth route', async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const next = nextMock();
    await run(middleware(getSession), req('/api/authx', 'guesshive.session_token=abc'), next);
    expect(getSession).toHaveBeenCalledOnce();
  });

  it('looks up the session without refreshing it', async () => {
    const getSession = vi.fn().mockResolvedValue(validSession);
    await run(middleware(getSession), req('/questions', 'guesshive.session_token=abc'), nextMock());
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableRefresh: true } }),
    );
  });

  it('puts the user and session (without token) on the request when the cookie resolves', async () => {
    const getSession = vi.fn().mockResolvedValue(validSession);
    const next = nextMock();
    const request = req('/questions', '__Secure-guesshive.session_token=abc');
    await run(middleware(getSession), request, next);
    expect(request.user).toEqual({ id, role: 'USER', status: 'ACTIVE', emailVerified: false });
    expect(request.authSession).toEqual({ id: 'session-1', expiresAt });
    expect(next).toHaveBeenCalledWith();
  });

  it('leaves the request anonymous for an invalid cookie', async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const next = nextMock();
    const request = req('/questions', 'guesshive.session_token=bogus');
    await run(middleware(getSession), request, next);
    expect(request.user).toBeUndefined();
    expect(request.authSession).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['an unknown role', { role: 'ROOT' }],
    ['an unknown status', { status: 'DELETED' }],
  ])('leaves the request anonymous when the user has %s', async (_label, patch) => {
    const getSession = vi.fn().mockResolvedValue({
      ...validSession,
      user: { ...validSession.user, ...patch },
    });
    const next = nextMock();
    const request = req('/questions', 'guesshive.session_token=abc');
    await run(middleware(getSession), request, next);
    expect(request.user).toBeUndefined();
    expect(request.authSession).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('treats a Better Auth UNAUTHORIZED error as a guest', async () => {
    const getSession = vi.fn().mockRejectedValue(new APIError('UNAUTHORIZED'));
    const next = nextMock();
    const request = req('/questions', 'guesshive.session_token=abc');
    await run(middleware(getSession), request, next);
    expect(next).toHaveBeenCalledWith();
    expect(request.user).toBeUndefined();
  });

  it('passes other Better Auth errors on to Nest', async () => {
    const error = new APIError('INTERNAL_SERVER_ERROR');
    const getSession = vi.fn().mockRejectedValue(error);
    const next = nextMock();
    await run(middleware(getSession), req('/questions', 'guesshive.session_token=abc'), next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it('passes lookup errors on to Nest', async () => {
    const error = new Error('db down');
    const getSession = vi.fn().mockRejectedValue(error);
    const next = nextMock();
    await run(middleware(getSession), req('/questions', 'guesshive.session_token=abc'), next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
