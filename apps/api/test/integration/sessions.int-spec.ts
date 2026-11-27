import type { NestExpressApplication } from '@nestjs/platform-express';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { type Queue, QueueEvents } from 'bullmq';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { createAuth } from '../../src/auth/auth.config.js';
import { AUTH } from '../../src/auth/auth.constants.js';
import {
  AUTH_JOBS,
  CLEANUP_EVERY_MS,
  CLEANUP_SCHEDULER_ID,
} from '../../src/auth/session-cleanup.processor.js';
import { SessionCleanupService } from '../../src/auth/session-cleanup.service.js';
import { SESSION_REFRESH_SECONDS, SESSION_TTL_SECONDS } from '../../src/auth/session-policy.js';
import { API_ENV } from '../../src/config/config.module.js';
import type { ApiEnv } from '../../src/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { QUEUE_NAMES, QUEUE_PREFIX } from '../../src/queue/queue.constants.js';
import { RATE_LIMIT_KEY_PREFIX } from '../../src/rate-limit/rate-limit.constants.js';
import { testRedisUrl } from './test-db-url.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';
const EVIL_ORIGIN = 'https://evil.example';
const CROSS_SITE = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors' };
const PASSWORD = 'correct-horse-battery-staple';
const COOKIE_NAME = 'guesshive.session_token';
const TTL_MS = SESSION_TTL_SECONDS * 1000;
const REFRESH_MS = SESSION_REFRESH_SECONDS * 1000;
/** Slack for the time between the request and the assertion. */
const SLACK_MS = 60_000;
const JOB_TIMEOUT_MS = 10_000;

function setCookiesOf(res: request.Response): string[] {
  return ([] as string[]).concat(res.headers['set-cookie'] ?? []);
}

/** The full Set-Cookie header of the session cookie, or undefined. */
function sessionSetCookie(res: request.Response): string | undefined {
  return setCookiesOf(res).find((c) => c.startsWith(`${COOKIE_NAME}=`));
}

/** name=value of the session cookie, for a Cookie header. */
function sessionCookieOf(res: request.Response): string {
  const header = sessionSetCookie(res);
  if (header === undefined) {
    throw new Error('no session cookie set');
  }
  return header.split(';', 1)[0] ?? '';
}

/** The database token inside a signed session cookie (`token.signature`, URL-encoded). */
function tokenOf(cookie: string): string {
  const value = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  return value.slice(0, value.lastIndexOf('.'));
}

let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `session${String(counter)}@guesshive.test`;
}

/** A user row straight in the database (no sign-in method needed). */
async function createUser(prisma: PrismaClient): Promise<string> {
  counter += 1;
  const name = `sess_user_${String(counter)}`;
  const user = await prisma.user.create({
    data: {
      email: `${name}@guesshive.test`,
      username: name,
      displayUsername: name,
      countryCode: 'NL',
      locale: 'nl',
      timezone: 'Europe/Amsterdam',
    },
  });
  return user.id;
}

async function startApp(workersEnabled: boolean): Promise<NestExpressApplication> {
  vi.stubEnv('WORKERS_ENABLED', workersEnabled ? 'true' : 'false');
  // email + password is only switched on in tests (the sign-in methods come with tasks 2.2-2.5).
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AUTH)
    .useFactory({
      inject: [PrismaService, API_ENV],
      factory: (client: PrismaService, env: ApiEnv) =>
        createAuth(client, env, { emailAndPassword: { enabled: true } }),
    })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useLogger(false);
  await app.init();
  return app;
}

/** Empties the auth queue (schedule included) on the guarded test Redis (db 15). */
async function emptyAuthQueue(app: NestExpressApplication): Promise<void> {
  expect(app.get<ApiEnv>(API_ENV).REDIS_URL).toBe(testRedisUrl());
  const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.auth));
  await queue.removeJobScheduler(CLEANUP_SCHEDULER_ID);
  await queue.obliterate({ force: true });
}

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.country.create({
    data: { code: 'NL', names: { nl: 'Nederland', en: 'Netherlands' } },
  });
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

// Sessions over HTTP (task 2.7): lifetime, sliding expiry, cookie attributes and signing out.
describe('sessions over HTTP (task 2.7)', () => {
  let app: NestExpressApplication;
  let redis: Redis;

  async function signUp(): Promise<{ cookie: string; email: string; userId: string }> {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ email, password: PASSWORD, name: 'Jan' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { cookie: sessionCookieOf(res), email, userId: user.id };
  }

  /** A second (third, …) session for the same user, as from another device. */
  async function signIn(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ email, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return sessionCookieOf(res);
  }

  async function whoami(cookie: string): Promise<string | null> {
    const res = await request(app.getHttpServer())
      .get('/api/auth/get-session')
      .query({ disableRefresh: 'true' })
      .set('Cookie', cookie)
      .expect(200);
    const body = res.body as { user: { id: string } } | null;
    return body?.user.id ?? null;
  }

  function sessionByCookie(cookie: string) {
    return prisma.session.findUnique({ where: { token: tokenOf(cookie) } });
  }

  beforeAll(async () => {
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    app = await startApp(false);
  });

  beforeEach(async () => {
    const keys = await redis.keys(`${RATE_LIMIT_KEY_PREFIX}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await emptyAuthQueue(app);
    await app.close();
    await redis.quit();
    vi.unstubAllEnvs();
  });

  describe('a new session', () => {
    it('gets an HttpOnly, SameSite=Lax, Path=/ cookie for 30 days, without Secure outside production', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email, password: PASSWORD, name: 'Jan' })
        .expect(200);
      const header = sessionSetCookie(res) ?? '';
      expect(header).toMatch(/;\s*HttpOnly/i);
      expect(header).toMatch(/;\s*SameSite=Lax/i);
      expect(header).toMatch(/;\s*Path=\/(;|$)/i);
      expect(header).toMatch(new RegExp(`;\\s*Max-Age=${String(SESSION_TTL_SECONDS)}(;|$)`, 'i'));
      expect(header).not.toMatch(/;\s*Secure/i);
      expect(header).not.toMatch(/;\s*Domain=/i);
    });

    it('expires in the database 30 days after sign-in', async () => {
      const before = Date.now();
      const { cookie } = await signUp();
      const session = await sessionByCookie(cookie);
      expect(session).not.toBeNull();
      const expiresAt = session?.expiresAt.getTime() ?? 0;
      expect(expiresAt).toBeGreaterThanOrEqual(before + TTL_MS - SLACK_MS);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + TTL_MS + SLACK_MS);
    });

    it('gets a new random token on every sign-in', async () => {
      const { cookie, email } = await signUp();
      const second = await signIn(email);
      const third = await signIn(email);
      const tokens = new Set([cookie, second, third].map(tokenOf));
      expect(tokens.size).toBe(3);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(3);
    });
  });

  describe('sliding expiry on GET /api/auth/get-session', () => {
    it('pushes the expiry of a session last refreshed over a day ago out to 30 days, with a new cookie', async () => {
      const { cookie, userId } = await signUp();
      const old = new Date(Date.now() + TTL_MS - REFRESH_MS - SLACK_MS);
      await prisma.session.updateMany({ where: { userId }, data: { expiresAt: old } });
      const res = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Cookie', cookie)
        .expect(200);
      expect((res.body as { user: { id: string } }).user.id).toBe(userId);
      const after = await sessionByCookie(cookie);
      expect(after?.expiresAt.getTime()).toBeGreaterThan(Date.now() + TTL_MS - SLACK_MS);
      const header = sessionSetCookie(res) ?? '';
      expect(header).toMatch(new RegExp(`;\\s*Max-Age=${String(SESSION_TTL_SECONDS)}(;|$)`, 'i'));
      expect(header).toMatch(/;\s*HttpOnly/i);
      // The token stays the same: refreshing extends the session, it does not rotate the token.
      expect(tokenOf(sessionCookieOf(res))).toBe(tokenOf(cookie));
      expect(await whoami(sessionCookieOf(res))).toBe(userId);
    });

    it('leaves a session refreshed less than a day ago alone (no write, no cookie)', async () => {
      const { cookie, userId } = await signUp();
      const recent = new Date(Date.now() + TTL_MS - REFRESH_MS + SLACK_MS * 10);
      await prisma.session.updateMany({ where: { userId }, data: { expiresAt: recent } });
      const res = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Cookie', cookie)
        .expect(200);
      expect((res.body as { user: { id: string } }).user.id).toBe(userId);
      expect((await sessionByCookie(cookie))?.expiresAt.getTime()).toBe(recent.getTime());
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    it('never refreshes on other routes (SessionMiddleware disables refresh)', async () => {
      const { cookie, userId } = await signUp();
      const old = new Date(Date.now() + TTL_MS - REFRESH_MS - SLACK_MS);
      await prisma.session.updateMany({ where: { userId }, data: { expiresAt: old } });
      const res = await request(app.getHttpServer()).get('/health').set('Cookie', cookie);
      expect(res.status).toBeLessThan(500);
      expect((await sessionByCookie(cookie))?.expiresAt.getTime()).toBe(old.getTime());
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    it('does not revive an expired session', async () => {
      const { cookie, userId } = await signUp();
      await prisma.session.updateMany({
        where: { userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await request(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toBeNull();
      const row = await sessionByCookie(cookie);
      if (row !== null) {
        expect(row.expiresAt.getTime()).toBeLessThan(Date.now());
      }
    });
  });

  describe('POST /api/auth/sign-out', () => {
    it('deletes only the current session and clears its cookie', async () => {
      const { cookie, email, userId } = await signUp();
      const other = await signIn(email);
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set({ Cookie: cookie, Origin: TRUSTED_ORIGIN })
        .send({})
        .expect(200);
      expect(await sessionByCookie(cookie)).toBeNull();
      expect(await sessionByCookie(other)).not.toBeNull();
      expect(await whoami(cookie)).toBeNull();
      expect(await whoami(other)).toBe(userId);
      expect(sessionSetCookie(res)).toMatch(/;\s*Max-Age=0/i);
    });
  });

  describe('POST /api/auth/revoke-sessions ("sign out everywhere")', () => {
    it('deletes every session of the user, but none of another user', async () => {
      const a = await signUp();
      const a2 = await signIn(a.email);
      const b = await signUp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/revoke-sessions')
        .set({ Cookie: a.cookie, Origin: TRUSTED_ORIGIN })
        .send({})
        .expect(200);
      expect(res.body).toEqual({ status: true });
      expect(await prisma.session.count({ where: { userId: a.userId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: b.userId } })).toBe(1);
      expect(await whoami(a.cookie)).toBeNull();
      expect(await whoami(a2)).toBeNull();
      expect(await whoami(b.cookie)).toBe(b.userId);
      expect(sessionSetCookie(res)).toMatch(/;\s*Max-Age=0/i);
    });

    it('works for a session signed in days ago (no freshness requirement)', async () => {
      const a = await signUp();
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await prisma.session.updateMany({
        where: { userId: a.userId },
        data: { createdAt: fiveDaysAgo },
      });
      await request(app.getHttpServer())
        .post('/api/auth/revoke-sessions')
        .set({ Cookie: a.cookie, Origin: TRUSTED_ORIGIN })
        .send({})
        .expect(200);
      expect(await prisma.session.count({ where: { userId: a.userId } })).toBe(0);
    });

    it('answers 401 without a session and deletes nothing', async () => {
      const a = await signUp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/revoke-sessions')
        .set('Origin', TRUSTED_ORIGIN)
        .send({});
      expect(res.status).toBe(401);
      const forged = await request(app.getHttpServer())
        .post('/api/auth/revoke-sessions')
        .set({ Cookie: `${COOKIE_NAME}=forged.signature`, Origin: TRUSTED_ORIGIN })
        .send({});
      expect(forged.status).toBe(401);
      expect(await prisma.session.count({ where: { userId: a.userId } })).toBe(1);
    });

    it('rejects an untrusted Origin with 403 and keeps the sessions', async () => {
      const a = await signUp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/revoke-sessions')
        .set({ Cookie: a.cookie, Origin: EVIL_ORIGIN, ...CROSS_SITE })
        .send({});
      expect(res.status).toBe(403);
      expect(await prisma.session.count({ where: { userId: a.userId } })).toBe(1);
    });
  });

  describe('POST /api/auth/revoke-other-sessions ("sign out other devices")', () => {
    it('keeps the current session and deletes the user’s others, never another user’s', async () => {
      const a = await signUp();
      const a2 = await signIn(a.email);
      const a3 = await signIn(a.email);
      const b = await signUp();
      const res = await request(app.getHttpServer())
        .post('/api/auth/revoke-other-sessions')
        .set({ Cookie: a2, Origin: TRUSTED_ORIGIN })
        .send({})
        .expect(200);
      expect(res.body).toEqual({ status: true });
      expect(await whoami(a2)).toBe(a.userId);
      expect(await whoami(a.cookie)).toBeNull();
      expect(await whoami(a3)).toBeNull();
      expect(await prisma.session.count({ where: { userId: a.userId } })).toBe(1);
      expect(await whoami(b.cookie)).toBe(b.userId);
      expect(sessionSetCookie(res)).toBeUndefined();
    });

    it('answers 401 without a session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/revoke-other-sessions')
        .set('Origin', TRUSTED_ORIGIN)
        .send({});
      expect(res.status).toBe(401);
    });

    it('rejects an untrusted Origin with 403 and keeps the sessions', async () => {
      const a = await signUp();
      await signIn(a.email);
      const res = await request(app.getHttpServer())
        .post('/api/auth/revoke-other-sessions')
        .set({ Cookie: a.cookie, Origin: EVIL_ORIGIN, ...CROSS_SITE })
        .send({});
      expect(res.status).toBe(403);
      expect(await prisma.session.count({ where: { userId: a.userId } })).toBe(2);
    });
  });

  describe('POST /api/auth/revoke-session (disabled)', () => {
    it.each(['/api/auth/revoke-session', '/api/auth/revoke-session/', '/api/auth/REVOKE-SESSION'])(
      'answers %s with 404 and leaves the target session alone',
      async (path) => {
        const a = await signUp();
        const other = await signIn(a.email);
        const res = await request(app.getHttpServer())
          .post(path)
          .set({ Cookie: a.cookie, Origin: TRUSTED_ORIGIN })
          .send({ token: tokenOf(other) });
        expect(res.status).toBe(404);
        expect(await whoami(other)).toBe(a.userId);
        expect(await prisma.session.count({ where: { userId: a.userId } })).toBe(2);
      },
    );
  });
});

// SessionCleanupService against the real database, at a fixed reference time.
describe('SessionCleanupService against Postgres (task 2.7)', () => {
  const NOW = new Date('2026-11-28T12:00:00.000Z');
  const before = (ms: number) => new Date(NOW.getTime() - ms);
  const after = (ms: number) => new Date(NOW.getTime() + ms);
  let service: SessionCleanupService;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    service = new SessionCleanupService(prisma as unknown as PrismaService);
    userA = await createUser(prisma);
    userB = await createUser(prisma);
  });

  beforeEach(async () => {
    await prisma.session.deleteMany({});
    await prisma.verification.deleteMany({});
  });

  it('removes only expired sessions and verification values, and counts them', async () => {
    await prisma.session.createMany({
      data: [
        { userId: userA, token: 'expired-long-ago', expiresAt: before(40 * 24 * 3600 * 1000) },
        { userId: userB, token: 'expired-just-now', expiresAt: before(1) },
        { userId: userA, token: 'at-the-boundary', expiresAt: NOW },
        { userId: userB, token: 'still-valid', expiresAt: after(1) },
      ],
    });
    await prisma.verification.createMany({
      data: [
        // Lock rows have UUIDv5 ids (ADR 0004): removed by expiry, not by id order.
        {
          id: '2ed6657d-e927-568b-95e1-2665a8aea6a2',
          identifier: 'lock',
          value: 'x',
          expiresAt: before(1),
        },
        { identifier: 'magic-link', value: 'h1', expiresAt: NOW },
        { identifier: 'reset', value: 'h2', expiresAt: after(60_000) },
      ],
    });

    await expect(service.deleteExpired(NOW)).resolves.toEqual({ sessions: 2, verifications: 1 });

    const sessions = await prisma.session.findMany({ orderBy: { token: 'asc' } });
    expect(sessions.map((s) => s.token)).toEqual(['at-the-boundary', 'still-valid']);
    const verifications = await prisma.verification.findMany({ orderBy: { identifier: 'asc' } });
    expect(verifications.map((v) => v.identifier)).toEqual(['magic-link', 'reset']);
    // Users are never touched.
    expect(await prisma.user.count({ where: { id: { in: [userA, userB] } } })).toBe(2);
  });

  it('is idempotent and returns zero counts when nothing has expired', async () => {
    await prisma.session.create({
      data: { userId: userA, token: 'valid', expiresAt: after(1000) },
    });
    await expect(service.deleteExpired(NOW)).resolves.toEqual({ sessions: 0, verifications: 0 });
    await expect(service.deleteExpired(NOW)).resolves.toEqual({ sessions: 0, verifications: 0 });
    expect(await prisma.session.count()).toBe(1);
  });

  it('handles empty tables', async () => {
    await expect(service.deleteExpired(NOW)).resolves.toEqual({ sessions: 0, verifications: 0 });
  });
});

// The whole chain with a running worker: schedule at startup, job runs, rows disappear.
describe('session cleanup through the real queue (task 2.7)', () => {
  let app: NestExpressApplication | undefined;
  let events: QueueEvents;
  let userId: string;

  beforeAll(async () => {
    userId = await createUser(prisma);
    events = new QueueEvents(QUEUE_NAMES.auth, {
      connection: { url: testRedisUrl() },
      prefix: QUEUE_PREFIX,
    });
    await events.waitUntilReady();
  });

  afterAll(async () => {
    if (app) {
      await emptyAuthQueue(app);
      await app.close();
    }
    await events.close();
    vi.unstubAllEnvs();
  });

  it('schedules the hourly job at startup and runs it at once, deleting expired rows', async () => {
    await prisma.session.deleteMany({});
    await prisma.verification.deleteMany({});
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3600_000);
    await prisma.session.createMany({
      data: [
        { userId, token: 'queue-expired', expiresAt: past },
        { userId, token: 'queue-valid', expiresAt: future },
      ],
    });
    await prisma.verification.create({
      data: { identifier: 'queue-expired', value: 'h', expiresAt: past },
    });

    app = await startApp(true);
    const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.auth));
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]).toMatchObject({
      key: CLEANUP_SCHEDULER_ID,
      name: AUTH_JOBS.cleanupExpired,
      every: CLEANUP_EVERY_MS,
    });

    await vi.waitFor(
      async () => {
        expect(await prisma.session.count({ where: { token: 'queue-expired' } })).toBe(0);
        expect(await prisma.verification.count()).toBe(0);
      },
      { timeout: JOB_TIMEOUT_MS, interval: 100 },
    );
    expect(await prisma.session.count({ where: { token: 'queue-valid' } })).toBe(1);
  });

  it('keeps one schedule when the api starts again', async () => {
    if (!app) {
      throw new Error('app not started');
    }
    await app.close();
    app = await startApp(true);
    const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.auth));
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.map((s) => s.key)).toEqual([CLEANUP_SCHEDULER_ID]);
  });

  it('returns the counts from a cleanup job', async () => {
    if (!app) {
      throw new Error('app not started');
    }
    await prisma.session.create({
      data: { userId, token: 'job-expired', expiresAt: new Date(Date.now() - 1000) },
    });
    const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.auth));
    const job = await queue.add(AUTH_JOBS.cleanupExpired, {});
    await expect(job.waitUntilFinished(events, JOB_TIMEOUT_MS)).resolves.toEqual({
      sessions: 1,
      verifications: 0,
    });
  });

  it('fails a job with an unknown name', async () => {
    if (!app) {
      throw new Error('app not started');
    }
    const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.auth));
    const job = await queue.add('drop-everything', {});
    await expect(job.waitUntilFinished(events, JOB_TIMEOUT_MS)).rejects.toThrow(/Unknown auth job/);
  });
});

/** A loopback port nothing listens on (bound once, then released). */
async function closedPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
  return port;
}

// Security review 2.7: a Redis outage must never keep the api from starting.
describe('startup with Redis down (task 2.7)', () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('initialises the api within a few seconds when Redis is unreachable', async () => {
    vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${String(await closedPort())}/15`);
    const started = Date.now();
    const app = await startApp(false);
    try {
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      // Closing may wait for ioredis to give up reconnecting; never let it hang the suite.
      await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
    }
  });
});
