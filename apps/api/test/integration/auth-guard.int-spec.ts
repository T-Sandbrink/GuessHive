import { Controller, Get, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { createAuth } from '../../src/auth/auth.config.js';
import { AUTH } from '../../src/auth/auth.constants.js';
import { AllowRestricted, Public, Roles } from '../../src/auth/auth.decorators.js';
import type { UserRole, UserStatus } from '../../src/auth/request-user.js';
import { API_ENV } from '../../src/config/config.module.js';
import type { ApiEnv } from '../../src/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  GLOBAL_RATE_LIMIT,
  RATE_LIMIT_KEY_PREFIX,
} from '../../src/rate-limit/rate-limit.constants.js';
import { RateLimit } from '../../src/rate-limit/rate-limit.decorator.js';
import { testRedisUrl } from './test-db-url.js';
import { createTestPrisma, resetDatabase } from './test-db.js';
import { PASS_TURNSTILE, TURNSTILE_OK } from './turnstile-fake.js';

/** The web origin Better Auth trusts in tests (the BETTER_AUTH_URL default). */
const TRUSTED_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery-staple';

/** Test-only routes: no decorators means signed in and ACTIVE (default deny). */
@Controller('test-guard')
class ProtectedController {
  @Get('me')
  me(): { ok: true } {
    return { ok: true };
  }

  @Post('action')
  action(): { ok: true } {
    return { ok: true };
  }

  @Get('limited')
  @RateLimit({ limit: 1, ttlMs: 60_000 })
  limited(): { ok: true } {
    return { ok: true };
  }

  @Get('open')
  @Public()
  open(): { ok: true } {
    return { ok: true };
  }

  @Get('admin')
  @Roles('ADMIN')
  admin(): { ok: true } {
    return { ok: true };
  }

  @Get('staff')
  @Roles('MODERATOR', 'ADMIN')
  staff(): { ok: true } {
    return { ok: true };
  }

  @Get('restricted')
  @AllowRestricted()
  restricted(): { ok: true } {
    return { ok: true };
  }

  @Get('restricted-admin')
  @AllowRestricted()
  @Roles('ADMIN')
  restrictedAdmin(): { ok: true } {
    return { ok: true };
  }
}

/** A controller-level @Roles with one handler that replaces it. */
@Roles('ADMIN')
@Controller('test-guard-admin')
class AdminOnlyController {
  @Get('inherited')
  inherited(): { ok: true } {
    return { ok: true };
  }

  @Get('users')
  @Roles('USER')
  users(): { ok: true } {
    return { ok: true };
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

// The global AuthGuard and RolesGuard (task 2.8) inside the full api, against the test database.
// Sessions come from an email + password sign-up switched on only here (like auth.int-spec.ts);
// role and status are then set directly in the database.
describe('global AuthGuard and RolesGuard (task 2.8)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let redis: Redis;

  /** Signs up a fresh user, sets role and status, and returns its session cookie. */
  async function userCookie(
    role: UserRole = 'USER',
    status: UserStatus = 'ACTIVE',
  ): Promise<{ cookie: string; email: string }> {
    counter += 1;
    const email = `guard${String(counter)}@guesshive.test`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set({ Origin: TRUSTED_ORIGIN, ...TURNSTILE_OK })
      .send({ email, password: PASSWORD, name: 'Test' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await prisma.user.update({ where: { email }, data: { role, status } });
    return { cookie: sessionCookieOf(res.headers['set-cookie']), email };
  }

  function get(path: string, cookie?: string): request.Test {
    const req = request(app.getHttpServer()).get(path);
    return cookie === undefined ? req : req.set('Cookie', cookie);
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    await prisma.country.create({
      data: { code: 'NL', names: { nl: 'Nederland', en: 'Netherlands' } },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedController, AdminOnlyController],
    })
      .overrideProvider(AUTH)
      .useFactory({
        inject: [PrismaService, API_ENV],
        factory: (client: PrismaService, env: ApiEnv) =>
          createAuth(client, env, { emailAndPassword: { enabled: true } }, PASS_TURNSTILE),
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    await app.init();
  });

  beforeEach(async () => {
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

  describe('default deny', () => {
    it('answers a guest on a protected GET with 401 { code: UNAUTHORIZED }', async () => {
      const res = await get('/test-guard/me').expect(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED', message: expect.any(String) as unknown });
    });

    it('answers a guest on a protected POST with 401 as well', async () => {
      const res = await request(app.getHttpServer())
        .post('/test-guard/action')
        .send({})
        .expect(401);
      expect((res.body as { code: string }).code).toBe('UNAUTHORIZED');
    });

    it('treats a forged and an expired session cookie as a guest (401)', async () => {
      await get('/test-guard/me', 'guesshive.session_token=forged.signature').expect(401);
      const { cookie, email } = await userCookie();
      await prisma.session.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      await get('/test-guard/me', cookie).expect(401);
    });

    it('lets a signed-in ACTIVE user through with 200', async () => {
      const { cookie } = await userCookie();
      const res = await get('/test-guard/me', cookie).expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('answers a SUSPENDED user with 403 ACCOUNT_SUSPENDED', async () => {
      const { cookie } = await userCookie('USER', 'SUSPENDED');
      const res = await get('/test-guard/me', cookie).expect(403);
      expect(res.body).toEqual({
        code: 'ACCOUNT_SUSPENDED',
        message: expect.any(String) as unknown,
      });
    });

    it('answers a BANNED user with 403 ACCOUNT_BANNED', async () => {
      const { cookie } = await userCookie('USER', 'BANNED');
      const res = await get('/test-guard/me', cookie).expect(403);
      expect(res.body).toEqual({ code: 'ACCOUNT_BANNED', message: expect.any(String) as unknown });
    });

    it('picks up a status change on the next request (no cached session user)', async () => {
      const { cookie, email } = await userCookie();
      await get('/test-guard/me', cookie).expect(200);
      await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });
      await get('/test-guard/me', cookie).expect(403);
    });
  });

  describe('@Roles', () => {
    it.each(['USER', 'MODERATOR'] as const)(
      'refuses %s on @Roles("ADMIN") with 403 FORBIDDEN',
      async (role) => {
        const { cookie } = await userCookie(role);
        const res = await get('/test-guard/admin', cookie).expect(403);
        expect(res.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String) as unknown });
      },
    );

    it('lets ADMIN through @Roles("ADMIN")', async () => {
      const { cookie } = await userCookie('ADMIN');
      await get('/test-guard/admin', cookie).expect(200);
    });

    it('answers a guest on @Roles("ADMIN") with 401, not 403', async () => {
      const res = await get('/test-guard/admin').expect(401);
      expect((res.body as { code: string }).code).toBe('UNAUTHORIZED');
    });

    it('@Roles("MODERATOR", "ADMIN"): MODERATOR and ADMIN pass, USER gets 403', async () => {
      await get('/test-guard/staff', (await userCookie('MODERATOR')).cookie).expect(200);
      await get('/test-guard/staff', (await userCookie('ADMIN')).cookie).expect(200);
      const res = await get('/test-guard/staff', (await userCookie('USER')).cookie).expect(403);
      expect((res.body as { code: string }).code).toBe('FORBIDDEN');
    });

    it("applies a controller's @Roles to its handlers", async () => {
      await get('/test-guard-admin/inherited', (await userCookie('ADMIN')).cookie).expect(200);
      await get('/test-guard-admin/inherited', (await userCookie('USER')).cookie).expect(403);
    });

    it("lets a handler's @Roles override the controller's", async () => {
      await get('/test-guard-admin/users', (await userCookie('USER')).cookie).expect(200);
      const res = await get('/test-guard-admin/users', (await userCookie('ADMIN')).cookie).expect(
        403,
      );
      expect((res.body as { code: string }).code).toBe('FORBIDDEN');
    });

    it('answers a BANNED ADMIN with 403 ACCOUNT_BANNED, on admin and plain routes alike', async () => {
      const { cookie } = await userCookie('ADMIN', 'BANNED');
      const admin = await get('/test-guard/admin', cookie).expect(403);
      expect((admin.body as { code: string }).code).toBe('ACCOUNT_BANNED');
      const plain = await get('/test-guard/me', cookie).expect(403);
      expect((plain.body as { code: string }).code).toBe('ACCOUNT_BANNED');
    });

    it('answers a SUSPENDED ADMIN on an admin route with 403 ACCOUNT_SUSPENDED', async () => {
      const { cookie } = await userCookie('ADMIN', 'SUSPENDED');
      const res = await get('/test-guard/admin', cookie).expect(403);
      expect((res.body as { code: string }).code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('public routes', () => {
    it('lets a guest call a @Public() route', async () => {
      const res = await get('/test-guard/open').expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it.each([
      ['USER', 'ACTIVE'],
      ['USER', 'SUSPENDED'],
      ['ADMIN', 'BANNED'],
    ] as const)('lets a %s %s user call a @Public() route', async (role, status) => {
      const { cookie } = await userCookie(role, status);
      await get('/test-guard/open', cookie).expect(200);
    });

    it('answers GET /health with 200 without a session', async () => {
      const res = await get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
    });

    it('answers GET /health with 200 for a BANNED user too', async () => {
      const { cookie } = await userCookie('USER', 'BANNED');
      await get('/health', cookie).expect(200);
    });

    it('keeps /api/auth/get-session reachable for a guest', async () => {
      const res = await get('/api/auth/get-session').expect(200);
      expect(res.body).toBeNull();
    });

    it.each(['SUSPENDED', 'BANNED'] as const)(
      'lets a %s user sign out (POST /api/auth/sign-out)',
      async (status) => {
        const { cookie, email } = await userCookie('USER', status);
        expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
        await request(app.getHttpServer())
          .post('/api/auth/sign-out')
          .set({ Cookie: cookie, Origin: TRUSTED_ORIGIN })
          .send({})
          .expect(200);
        expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
        // Signed out: the protected route now sees a guest.
        await get('/test-guard/me', cookie).expect(401);
      },
    );
  });

  describe('@AllowRestricted()', () => {
    it.each(['ACTIVE', 'SUSPENDED', 'BANNED'] as const)(
      'lets a %s user through',
      async (status) => {
        const { cookie } = await userCookie('USER', status);
        const res = await get('/test-guard/restricted', cookie).expect(200);
        expect(res.body).toEqual({ ok: true });
      },
    );

    it('still answers a guest with 401 UNAUTHORIZED', async () => {
      const res = await get('/test-guard/restricted').expect(401);
      expect((res.body as { code: string }).code).toBe('UNAUTHORIZED');
    });

    it('with @Roles("ADMIN") still requires an ACTIVE admin', async () => {
      await get('/test-guard/restricted-admin', (await userCookie('ADMIN')).cookie).expect(200);
      const suspended = await get(
        '/test-guard/restricted-admin',
        (await userCookie('ADMIN', 'SUSPENDED')).cookie,
      ).expect(403);
      expect((suspended.body as { code: string }).code).toBe('ACCOUNT_SUSPENDED');
      const banned = await get(
        '/test-guard/restricted-admin',
        (await userCookie('ADMIN', 'BANNED')).cookie,
      ).expect(403);
      expect((banned.body as { code: string }).code).toBe('ACCOUNT_BANNED');
      const user = await get(
        '/test-guard/restricted-admin',
        (await userCookie('USER')).cookie,
      ).expect(403);
      expect((user.body as { code: string }).code).toBe('FORBIDDEN');
    });
  });

  describe('routing and guard order', () => {
    it('answers an unknown route with 404 NOT_FOUND, not 401, for a guest', async () => {
      const res = await get('/does-not-exist').expect(404);
      expect((res.body as { code: string }).code).toBe('NOT_FOUND');
    });

    it('answers an unknown method on a known path with 404, not 401', async () => {
      const res = await request(app.getHttpServer()).delete('/test-guard/me');
      expect(res.status).toBe(404);
    });

    it('rate limits a guest before the auth guard answers 401', async () => {
      // Route limit 1 a minute: the first request is counted (then 401), the second is 429.
      // Were the auth guard first, the guest would never be counted and get 401 twice.
      await get('/test-guard/limited').expect(401);
      const res = await get('/test-guard/limited').expect(429);
      expect((res.body as { code: string }).code).toBe('RATE_LIMITED');
    });

    it('answers a guest over the global rate limit on a protected route with 429, not 401', async () => {
      for (let i = 0; i < GLOBAL_RATE_LIMIT.limit; i++) {
        await get('/test-guard/me').expect(401);
      }
      const res = await get('/test-guard/me').expect(429);
      expect((res.body as { code: string }).code).toBe('RATE_LIMITED');
    });
  });
});
