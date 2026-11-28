import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { createAuth } from '../../src/auth/auth.config.js';
import { AUTH } from '../../src/auth/auth.constants.js';
import {
  TURNSTILE_HEADER,
  TURNSTILE_TOKEN_MAX_LENGTH,
  type TurnstileResult,
  type TurnstileVerifier,
} from '../../src/auth/turnstile.js';
import { API_ENV } from '../../src/config/config.module.js';
import type { ApiEnv } from '../../src/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { RATE_LIMIT_KEY_PREFIX } from '../../src/rate-limit/rate-limit.constants.js';
import { testRedisUrl } from './test-db-url.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

/** The web origin Better Auth trusts in tests (the BETTER_AUTH_URL default). */
const TRUSTED_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery-staple';

let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `turnstile${String(counter)}@guesshive.test`;
}

async function clearRateLimits(redis: Redis): Promise<void> {
  const keys = await redis.keys(`${RATE_LIMIT_KEY_PREFIX}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// Turnstile on sign-up (task 2.9) inside the full api, with a controllable fake verifier in place
// of Cloudflare. email + password is switched on only here (production enables it in 2.2).
describe('Turnstile on sign-up (task 2.9)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let redis: Redis;
  let answer: TurnstileResult = { ok: true };
  const verify = vi.fn<TurnstileVerifier>(() => Promise.resolve(answer));

  function signUp(path: string, headers: Record<string, string>, email = uniqueEmail()) {
    return request(app.getHttpServer())
      .post(path)
      .set({ Origin: TRUSTED_ORIGIN, ...headers })
      .send({ email, password: PASSWORD, name: 'Jan Jansen' });
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    await resetDatabase(prisma);
    await prisma.country.create({
      data: { code: 'NL', names: { nl: 'Nederland', en: 'Netherlands' } },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH)
      .useFactory({
        inject: [PrismaService, API_ENV],
        factory: (client: PrismaService, env: ApiEnv) =>
          createAuth(client, env, { emailAndPassword: { enabled: true } }, verify),
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    await app.init();
  });

  beforeEach(async () => {
    answer = { ok: true };
    verify.mockClear();
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
    await resetDatabase(prisma);
    await prisma.$disconnect();
    await redis.quit();
  });

  it('signs up with a valid token, checked for the sign-up action', async () => {
    const email = uniqueEmail();
    const res = await signUp('/api/auth/sign-up/email', { [TURNSTILE_HEADER]: 'good' }, email);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(verify).toHaveBeenCalledExactlyOnceWith('good', 'sign-up');
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it.each<Record<string, string>>([{}, { [TURNSTILE_HEADER]: '' }, { [TURNSTILE_HEADER]: '   ' }])(
    'refuses a sign-up without a token (%j) with 400 TURNSTILE_REQUIRED',
    async (headers) => {
      const email = uniqueEmail();
      const res = await signUp('/api/auth/sign-up/email', headers, email);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'TURNSTILE_REQUIRED' });
      expect(verify).not.toHaveBeenCalled();
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    },
  );

  it.each(['rejected', 'hostname_mismatch', 'action_mismatch'] as const)(
    'refuses a token Cloudflare does not accept (%s) with 403 TURNSTILE_FAILED',
    async (reason) => {
      answer = { ok: false, reason };
      const email = uniqueEmail();
      const res = await signUp('/api/auth/sign-up/email', { [TURNSTILE_HEADER]: 'bad' }, email);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'TURNSTILE_FAILED' });
      expect(JSON.stringify(res.body)).not.toContain(reason);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    },
  );

  it('fails closed with 503 when Cloudflare is unreachable', async () => {
    answer = { ok: false, reason: 'unavailable' };
    const email = uniqueEmail();
    const res = await signUp('/api/auth/sign-up/email', { [TURNSTILE_HEADER]: 'any' }, email);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('refuses an over-long token without asking Cloudflare', async () => {
    const res = await signUp('/api/auth/sign-up/email', {
      [TURNSTILE_HEADER]: 'x'.repeat(TURNSTILE_TOKEN_MAX_LENGTH + 1),
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'TURNSTILE_FAILED' });
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([
    '/api/auth/Sign-Up/email',
    '/api/auth/SIGN-UP/EMAIL',
    '/api/auth/sign-up/email/',
    '/api/auth/x/../sign-up/email',
    '/api/auth/%2e%2e/auth/sign-up/email',
    '/api/auth//sign-up/email',
  ])('cannot be bypassed through the path variant %s', async (path) => {
    const email = uniqueEmail();
    const res = await signUp(path, {}, email);
    // However Better Auth routes the variant, it never creates an account without a token.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('does not ask for a token on sign-in', async () => {
    const email = uniqueEmail();
    await signUp('/api/auth/sign-up/email', { [TURNSTILE_HEADER]: 'good' }, email);
    verify.mockClear();
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ email, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

// The api as it starts in production: AUTH is not overridden, so the real Cloudflare verifier is
// wired in. A request without a token never reaches Cloudflare, so no network call happens.
describe('Turnstile in the default auth wiring (task 2.9)', () => {
  let app: NestExpressApplication;
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    await app.init();
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
  });

  it('requires a token on sign-up before anything else is checked', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ email: uniqueEmail(), password: PASSWORD, name: 'Jan' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'TURNSTILE_REQUIRED' });
  });
});
