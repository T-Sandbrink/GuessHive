import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type RequestListener, createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { type Auth, createAuth } from '../../src/auth/auth.config.js';
import { AUTH } from '../../src/auth/auth.constants.js';
import type { AuthenticatedRequest } from '../../src/auth/request-user.js';
import { API_ENV } from '../../src/config/config.module.js';
import type { ApiEnv } from '../../src/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { MailService } from '../../src/mail/mail.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { RATE_LIMIT_KEY_PREFIX } from '../../src/rate-limit/rate-limit.constants.js';
import { SettingsService } from '../../src/settings/settings.service.js';
import { testRedisUrl } from './test-db-url.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

/** The web origin Better Auth trusts in tests (the BETTER_AUTH_URL default). */
const TRUSTED_ORIGIN = 'http://localhost:5173';
const EVIL_ORIGIN = 'https://evil.example';
const PASSWORD = 'correct-horse-battery-staple';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PLACEHOLDER = /^bij_[abcdefghjkmnpqrstuvwxyz23456789]{10}$/;
/** What a browser sends on a cross-site fetch; it makes Better Auth check the Origin. */
const CROSS_SITE = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors' };

/** Test-only routes outside /api/auth: what SessionMiddleware put on the request, and a body echo. */
@Controller('test-auth')
class ProbeController {
  @Get('whoami')
  whoami(@Req() req: AuthenticatedRequest): { user: unknown; session: unknown } {
    return { user: req.user ?? null, session: req.authSession ?? null };
  }

  @Post('echo')
  echo(@Body() body: unknown): { body: unknown } {
    return { body };
  }
}

/** The session cookie (name=value) from a Set-Cookie list. */
function sessionCookieOf(setCookie: string[] | string | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie];
  const header = list.find((c) => c.startsWith('guesshive.session_token='));
  if (header === undefined) {
    throw new Error('no guesshive.session_token cookie set');
  }
  return header.split(';', 1)[0] ?? '';
}

let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `user${String(counter)}@guesshive.test`;
}

// Better Auth (task 2.1) inside the full api (Nest's default body parsers, like main.ts), against
// the test database, with the production AuthModule wiring (email + password since task 2.2).
// MailService is a no-op fake: the mail flows are covered in auth-email-password.int-spec.ts.
describe('Better Auth integration (task 2.1)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let redis: Redis;

  async function signUp(
    headers: Record<string, string> = {},
    body: Record<string, unknown> = {},
  ): Promise<{ res: request.Response; cookie: string; email: string }> {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set({ Origin: TRUSTED_ORIGIN, ...headers })
      .send({ email, password: PASSWORD, name: 'Jan Jansen', ...body });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return { res, cookie: sessionCookieOf(res.headers['set-cookie']), email };
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    // Reference data a new account points at (the placeholder country, User.countryCode FK).
    await prisma.country.create({
      data: { code: 'NL', names: { nl: 'Nederland', en: 'Netherlands' } },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(MailService)
      .useValue({ sendInBackground: vi.fn(), send: vi.fn().mockResolvedValue(undefined) })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    await app.init();
  });

  beforeEach(async () => {
    // A fresh rate-limit budget per test (one IP makes all requests).
    const keys = await redis.keys(`${RATE_LIMIT_KEY_PREFIX}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await app.close();
    await resetDatabase(prisma);
    await prisma.$disconnect();
    await redis.quit();
  });

  describe('POST /api/auth/sign-up/email', () => {
    it('creates the user with a placeholder profile, ignoring the name and photo sent', async () => {
      const { res, email } = await signUp(
        { 'Accept-Language': 'en-GB,en;q=0.9' },
        { image: 'https://provider.example/jan.jpg' },
      );
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.id).toMatch(UUID_V7);
      expect(user.displayUsername).toMatch(PLACEHOLDER);
      expect(user.username).toBe(user.displayUsername.toLowerCase());
      expect(user.avatarUrl).toBeNull();
      expect(user.countryCode).toBe('NL');
      expect(user.locale).toBe('en');
      expect(user.timezone).toBe('Europe/Amsterdam');
      expect(user.role).toBe('USER');
      expect(user.status).toBe('ACTIVE');
      expect(user.emailVerified).toBe(false);
      expect(JSON.stringify(user)).not.toContain('Jan Jansen');
      expect(JSON.stringify(res.body)).not.toContain('Jan Jansen');
      const body = res.body as { user: Record<string, unknown> };
      expect(body.user['id']).toBe(user.id);
      expect(body.user['name']).toBe(user.displayUsername);
    });

    it('defaults the locale to nl without Accept-Language, and with an unsupported one', async () => {
      const plain = await signUp();
      const german = await signUp({ 'Accept-Language': 'de-DE,de;q=0.9' });
      const users = await prisma.user.findMany({
        where: { email: { in: [plain.email, german.email] } },
      });
      expect(users.map((u) => u.locale)).toEqual(['nl', 'nl']);
    });

    it('reads nl from a Belgian Accept-Language', async () => {
      const { email } = await signUp({ 'Accept-Language': 'nl-BE,fr;q=0.8' });
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).locale).toBe('nl');
    });

    it('sets an HttpOnly, SameSite=Lax session cookie named guesshive.session_token', async () => {
      const { res } = await signUp();
      const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      const session = setCookie.find((c) => c.startsWith('guesshive.session_token='));
      expect(session).toBeDefined();
      expect(session).toMatch(/;\s*HttpOnly/i);
      expect(session).toMatch(/;\s*SameSite=Lax/i);
      expect(session).toMatch(/;\s*Path=\//i);
    });

    it('never stores an IP address on the session, even with X-Forwarded-For', async () => {
      const { email } = await signUp({
        'X-Forwarded-For': '203.0.113.7',
        'X-Real-IP': '203.0.113.8',
        'CF-Connecting-IP': '203.0.113.9',
      });
      const sessions = await prisma.session.findMany({ where: { user: { email } } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.ipAddress).toBeNull();
      const raw = await prisma.$queryRaw<{ ipAddress: string | null }[]>`
        SELECT "ipAddress" FROM "Session" WHERE "userId" = ${sessions[0]?.userId ?? ''}::uuid`;
      expect(raw).toEqual([{ ipAddress: null }]);
    });

    it('stores the password hashed in Account, never in plain text', async () => {
      const { email } = await signUp();
      const account = await prisma.account.findFirstOrThrow({ where: { user: { email } } });
      expect(account.providerId).toBe('credential');
      expect(account.id).toMatch(UUID_V7);
      expect(account.password).not.toBeNull();
      expect(account.password).not.toContain(PASSWORD);
    });

    it('does not let the client set role, status, username or country', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          email,
          password: PASSWORD,
          name: 'Jan',
          role: 'ADMIN',
          status: 'ACTIVE',
          username: 'admin',
          countryCode: 'BE',
        });
      // Better Auth either refuses the fields (FIELD_NOT_ALLOWED) or ignores them; never stores them.
      const user = await prisma.user.findUnique({ where: { email } });
      if (res.status === 400) {
        expect((res.body as { code: string }).code).toBe('FIELD_NOT_ALLOWED');
        expect(user).toBeNull();
      } else {
        expect(res.status).toBe(200);
        expect(user).toMatchObject({ role: 'USER', countryCode: 'NL' });
        expect(user?.username).toMatch(PLACEHOLDER);
      }
      expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(0);
    });

    it('rejects a duplicate email without creating a second user', async () => {
      const { email } = await signUp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email, password: PASSWORD, name: 'Again' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it('rejects a cross-site request from an untrusted Origin with 403', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set({ Origin: EVIL_ORIGIN, ...CROSS_SITE })
        .send({ email, password: PASSWORD, name: 'Eve' });
      expect(res.status).toBe(403);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });
  });

  describe('GET /api/auth/get-session', () => {
    it('returns the signed-in user for the session cookie', async () => {
      const { cookie, email } = await signUp();
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const res = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Cookie', cookie)
        .expect(200);
      const body = res.body as { user: Record<string, unknown>; session: Record<string, unknown> };
      expect(body.user).toMatchObject({ id: user.id, email, name: user.displayUsername });
      expect(body.session['userId']).toBe(user.id);
    });

    it('returns null without a cookie and for a forged cookie', async () => {
      const none = await request(app.getHttpServer()).get('/api/auth/get-session').expect(200);
      expect(none.body).toBeNull();
      const forged = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Cookie', 'guesshive.session_token=forged.signature')
        .expect(200);
      expect(forged.body).toBeNull();
    });
  });

  describe('SessionMiddleware on non-auth routes', () => {
    it('puts the signed-in user on req.user', async () => {
      const { cookie, email } = await signUp();
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const res = await request(app.getHttpServer())
        .get('/test-auth/whoami')
        .set('Cookie', cookie)
        .expect(200);
      const body = res.body as { user: unknown; session: { id: string } | null };
      expect(body.user).toEqual({
        id: user.id,
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: false,
      });
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(body.session?.id).toBe(session.id);
      expect(JSON.stringify(body)).not.toContain(session.token);
    });

    it('counts a signed-in user by id in the global rate limit', async () => {
      const { cookie, email } = await signUp();
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      await request(app.getHttpServer()).get('/test-auth/whoami').set('Cookie', cookie);
      const keys = await redis.keys(`${RATE_LIMIT_KEY_PREFIX}:*`);
      expect(keys.some((key) => key.includes(`user:${user.id}`))).toBe(true);
    });

    it('leaves guests and invalid cookies anonymous', async () => {
      const guest = await request(app.getHttpServer()).get('/test-auth/whoami').expect(200);
      expect(guest.body).toEqual({ user: null, session: null });
      const forged = await request(app.getHttpServer())
        .get('/test-auth/whoami')
        .set('Cookie', 'guesshive.session_token=forged.signature')
        .expect(200);
      expect(forged.body).toEqual({ user: null, session: null });
    });

    it('leaves an expired session anonymous', async () => {
      const { cookie, email } = await signUp();
      await prisma.session.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const res = await request(app.getHttpServer())
        .get('/test-auth/whoami')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual({ user: null, session: null });
    });
  });

  describe('POST /api/auth/update-user (disabled)', () => {
    it.each([
      '/api/auth/update-user',
      '/api/auth/update-user/',
      '/api/auth/update-user?x=1',
      '/api/auth//update-user',
    ])('answers %s with 404 and leaves the profile unchanged', async (path) => {
      const { cookie, email } = await signUp();
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });
      const res = await request(app.getHttpServer())
        .post(path)
        .set({ Cookie: cookie, Origin: TRUSTED_ORIGIN })
        .send({ name: 'Jan Jansen', image: 'https://provider.example/jan.jpg' });
      expect(res.status).toBe(404);
      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.displayUsername).toBe(before.displayUsername);
      expect(after.username).toBe(before.username);
      expect(after.avatarUrl).toBeNull();
    });
  });

  describe('user update hook', () => {
    it('drops name, image and username from every Better Auth update', async () => {
      const { email } = await signUp();
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });
      const auth = app.get<Auth>(AUTH);
      await (
        await auth.$context
      ).internalAdapter.updateUser(before.id, {
        name: 'Jan Jansen',
        image: 'https://provider.example/jan.jpg',
        username: 'jan',
        emailVerified: true,
      });
      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.emailVerified).toBe(true);
      expect(after.displayUsername).toBe(before.displayUsername);
      expect(after.username).toBe(before.username);
      expect(after.avatarUrl).toBeNull();
    });

    it('still drops them when a plugin adds its own update hook that sets a name', async () => {
      const { email } = await signUp();
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });
      const env = app.get<ApiEnv>(API_ENV);
      const testPlugin = {
        id: 'test-hook',
        init: () => ({
          options: {
            databaseHooks: {
              user: {
                update: {
                  before: (u: Record<string, unknown>) =>
                    Promise.resolve({ data: { ...u, name: 'Real Name' } }),
                },
              },
            },
          },
        }),
      };
      const auth = createAuth(app.get(PrismaService), env, app.get(SettingsService), {
        emailAndPassword: { enabled: true },
        plugins: [testPlugin],
      });
      await (
        await auth.$context
      ).internalAdapter.updateUser(before.id, {
        name: 'X',
        image: 'https://x.example/p.png',
        emailVerified: true,
      });
      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.emailVerified).toBe(true);
      expect(after.displayUsername).toBe(before.displayUsername);
      expect(after.username).toBe(before.username);
      expect(after.avatarUrl).toBeNull();
    });
  });

  describe('other disabled Better Auth endpoints', () => {
    it.each([
      ['GET', '/api/auth/list-sessions'],
      ['POST', '/api/auth/update-session'],
      ['POST', '/api/auth/link-social'],
      ['POST', '/api/auth/unlink-account'],
      ['GET', '/api/auth/account-info'],
    ])('answers %s %s with 404, even when signed in', async (method, path) => {
      const { cookie } = await signUp();
      const req = request(app.getHttpServer());
      const res = await (method === 'GET' ? req.get(path) : req.post(path).send({})).set({
        Cookie: cookie,
        Origin: TRUSTED_ORIGIN,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('origin and callback checks', () => {
    it('rejects a sign-up whose callbackURL points at an untrusted origin with 403', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email, password: PASSWORD, name: 'Jan', callbackURL: 'https://evil.example/x' });
      expect(res.status).toBe(403);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('accepts a relative callbackURL', async () => {
      const { email } = await signUp({}, { callbackURL: '/nl/onboarding' });
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });
  });

  describe('request bodies on /api/auth', () => {
    it('answers a body the parsers did not read (text/plain) with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set({ Origin: TRUSTED_ORIGIN, 'Content-Type': 'text/plain' })
        .send(JSON.stringify({ email, password: PASSWORD, name: 'Jan' }));
      expect(res.status).toBe(415);
      expect(res.body).toEqual({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: expect.any(String) as unknown,
      });
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('answers a chunked body the parsers did not read with 415', async () => {
      const server = createServer(app.getHttpAdapter().getInstance() as RequestListener);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const { port } = server.address() as AddressInfo;
        const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = httpRequest(
            {
              host: '127.0.0.1',
              port,
              method: 'POST',
              path: '/api/auth/sign-out',
              headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/octet-stream' },
            },
            (res) => {
              let body = '';
              res.setEncoding('utf8');
              res.on('data', (chunk: string) => (body += chunk));
              res.on('end', () => {
                resolve({ status: res.statusCode ?? 0, body });
              });
            },
          );
          req.on('error', reject);
          // No Content-Length: Node sends the body with Transfer-Encoding: chunked.
          req.write('raw ');
          req.end('bytes');
        });
        expect(result.status).toBe(415);
        expect((JSON.parse(result.body) as { code: string }).code).toBe('UNSUPPORTED_MEDIA_TYPE');
      } finally {
        await new Promise<void>((resolve) =>
          server.close(() => {
            resolve();
          }),
        );
      }
    });

    it('answers a JSON body over 100 kb with 413', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email: uniqueEmail(), password: 'x'.repeat(110 * 1024) });
      expect(res.status).toBe(413);
    });

    it('accepts a POST without a body', async () => {
      const { cookie, email } = await signUp();
      await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set({ Cookie: cookie, Origin: TRUSTED_ORIGIN })
        .expect(200);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
    });
  });

  describe('POST /api/auth/sign-out', () => {
    it('deletes the session row and ends the session', async () => {
      const { cookie, email } = await signUp();
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
      await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set({ Cookie: cookie, Origin: TRUSTED_ORIGIN })
        .send({})
        .expect(200);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
      const after = await request(app.getHttpServer())
        .get('/test-auth/whoami')
        .set('Cookie', cookie)
        .expect(200);
      expect(after.body).toEqual({ user: null, session: null });
    });

    it('rejects an untrusted Origin with 403 and keeps the session', async () => {
      const { cookie, email } = await signUp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set({ Cookie: cookie, Origin: EVIL_ORIGIN })
        .send({});
      expect(res.status).toBe(403);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
    });

    it('rejects a cookie-carrying POST without Origin with 403', async () => {
      const { cookie, email } = await signUp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set('Cookie', cookie)
        .send({});
      expect(res.status).toBe(403);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
    });
  });

  describe('body parsing outside /api/auth', () => {
    it('still parses JSON bodies on other routes', async () => {
      const res = await request(app.getHttpServer())
        .post('/test-auth/echo')
        .send({ title: 'Beste speler', tags: ['voetbal'] })
        .expect(201);
      expect(res.body).toEqual({ body: { title: 'Beste speler', tags: ['voetbal'] } });
    });

    it('still parses urlencoded bodies on other routes', async () => {
      const res = await request(app.getHttpServer())
        .post('/test-auth/echo')
        .type('form')
        .send('title=Beste+speler&choice=a')
        .expect(201);
      expect(res.body).toEqual({ body: { title: 'Beste speler', choice: 'a' } });
    });

    it('answers malformed JSON on other routes with 400 BAD_REQUEST', async () => {
      const res = await request(app.getHttpServer())
        .post('/test-auth/echo')
        .set('Content-Type', 'application/json')
        .send('{"broken":');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'BAD_REQUEST', message: 'Bad request' });
    });
  });
});

// The production options straight from createAuth: Better Auth would skip its origin/CSRF checks
// under NODE_ENV=test unless auth.config.ts pins them on.
describe('Better Auth origin check with the production options (task 2.1)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it('rejects a cookie-carrying POST from an untrusted Origin regardless of NODE_ENV', async () => {
    const env = {
      BETTER_AUTH_SECRET: 'development-only-better-auth-secret-not-for-production',
      BETTER_AUTH_URL: TRUSTED_ORIGIN,
      NODE_ENV: 'test',
    } as ApiEnv;
    const auth = createAuth(prisma, env, { get: () => Promise.resolve(12) } as never);
    const res = await auth.handler(
      new Request(`${TRUSTED_ORIGIN}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'guesshive.session_token=anything',
          Origin: EVIL_ORIGIN,
          ...CROSS_SITE,
        },
        body: '{}',
      }),
    );
    expect(res.status).toBe(403);
  });
});
