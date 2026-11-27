import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { MailMessage } from '../../src/mail/mail.service.js';
import { MailService } from '../../src/mail/mail.service.js';
import { MAGIC_LINK_TTL_SECONDS } from '../../src/mail/templates.js';
import { RATE_LIMIT_KEY_PREFIX } from '../../src/rate-limit/rate-limit.constants.js';
import { testRedisUrl } from './test-db-url.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

/** The web origin Better Auth trusts in tests (the BETTER_AUTH_URL default). */
const ORIGIN = 'http://localhost:5173';
const EVIL = 'https://evil.example';
const PASSWORD = 'correct-horse-battery'; // 21 characters
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PLACEHOLDER = /^bij_[abcdefghjkmnpqrstuvwxyz23456789]{10}$/;
const SUBJECT = { nl: 'Je inloglink voor GuessHive', en: 'Your GuessHive sign-in link' };

/** The session cookie (name=value) from a Set-Cookie list, or undefined. */
function sessionCookieOf(setCookie: string[] | string | undefined): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie];
  return list.find((c) => c.startsWith('guesshive.session_token='))?.split(';', 1)[0];
}

let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `magic${String(counter)}@guesshive.test`;
}

/** The first link in a message's plain text. */
function linkOf(message: MailMessage): URL {
  const match = /https?:\/\/\S+/.exec(message.text);
  if (match === null) {
    throw new Error('no link in the mail');
  }
  return new URL(match[0]);
}

// Magic link via email (task 2.3) through the real AppModule wiring. Only MailService is replaced
// by a capturing fake, so the flows run without Mailpit.
describe('magic link sign-in (task 2.3)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let redis: Redis;
  const sent: MailMessage[] = [];
  const mail = {
    sendInBackground: vi.fn((message: MailMessage) => {
      sent.push(message);
    }),
    send: vi.fn((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  function mailsTo(email: string): MailMessage[] {
    return sent.filter((m) => m.to === email);
  }

  function requestLink(
    body: Record<string, unknown>,
    headers: Record<string, string> = { Origin: ORIGIN },
  ): Promise<request.Response> {
    return request(server()).post('/api/auth/sign-in/magic-link').set(headers).send(body);
  }

  /** Requests a link for `email` and returns the one link mailed for it. */
  async function linkFor(
    email: string,
    body: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Promise<{ link: URL; message: MailMessage }> {
    const before = mailsTo(email).length;
    const res = await requestLink({ email, ...body }, { Origin: ORIGIN, ...headers });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await vi.waitFor(() => {
      expect(mailsTo(email)).toHaveLength(before + 1);
    });
    const message = mailsTo(email).at(-1) as MailMessage;
    return { link: linkOf(message), message };
  }

  /** Follows a mailed link like a browser click: a plain GET, no Origin. */
  function follow(link: URL, headers: Record<string, string> = {}): Promise<request.Response> {
    return request(server()).get(`${link.pathname}${link.search}`).set(headers);
  }

  async function signUp(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD, name: 'Jan' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return sessionCookieOf(res.headers['set-cookie']) ?? '';
  }

  function signIn(email: string, password = PASSWORD): Promise<request.Response> {
    return request(server())
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password });
  }

  async function sessionOf(cookie: string): Promise<{ user: { email: string } } | null> {
    const res = await request(server()).get('/api/auth/get-session').set('Cookie', cookie);
    return res.body as { user: { email: string } } | null;
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    await prisma.country.create({
      data: { code: 'NL', names: { nl: 'Nederland', en: 'Netherlands' } },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
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
    sent.length = 0;
    mail.sendInBackground.mockClear();
    mail.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
    await resetDatabase(prisma);
    await prisma.$disconnect();
    await redis.quit();
  });

  describe('requesting a link', () => {
    it('answers an unknown address with 200 {status:true}, mails one link and creates no user yet', async () => {
      const email = uniqueEmail();
      const res = await requestLink({ email });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual({ status: true });
      expect(sessionCookieOf(res.headers['set-cookie'])).toBeUndefined();
      await vi.waitFor(() => {
        expect(mailsTo(email)).toHaveLength(1);
      });
      expect(sent).toHaveLength(1);
      expect(mail.send).not.toHaveBeenCalled();
      expect(await prisma.user.count({ where: { email } })).toBe(0);

      const link = linkOf(mailsTo(email)[0] as MailMessage);
      expect(link.origin).toBe(ORIGIN);
      expect(link.pathname).toBe('/api/auth/magic-link/verify');
      expect(link.searchParams.get('token')).toMatch(/^[a-zA-Z]{32}$/);
      expect(link.searchParams.get('callbackURL')).toBe('/');
    });

    it('answers a known and an unknown address exactly the same way', async () => {
      const known = uniqueEmail();
      await signUp(known);
      const a = await requestLink({ email: known });
      const b = await requestLink({ email: uniqueEmail() });
      expect(a.status).toBe(200);
      expect(b.status).toBe(a.status);
      expect(b.body).toEqual(a.body);
      expect(Object.keys(b.headers).sort()).toEqual(Object.keys(a.headers).sort());
      expect(sessionCookieOf(a.headers['set-cookie'])).toBeUndefined();
      expect(sessionCookieOf(b.headers['set-cookie'])).toBeUndefined();
    });

    it.each([
      ['nl', 'nl-NL,nl;q=0.9'],
      ['en', 'en-GB,en;q=0.9'],
    ] as const)(
      'mails an unknown address in the Accept-Language locale (%s)',
      async (locale, acceptLanguage) => {
        const email = uniqueEmail();
        const { message } = await linkFor(email, {}, { 'Accept-Language': acceptLanguage });
        expect(message.subject).toBe(SUBJECT[locale]);
        expect(message.html).toContain(`<html lang="${locale}">`);
      },
    );

    it("mails a known user in their profile locale, not the request's", async () => {
      const email = uniqueEmail();
      await request(server())
        .post('/api/auth/sign-up/email')
        .set({ Origin: ORIGIN, 'Accept-Language': 'en' })
        .send({ email, password: PASSWORD, name: 'Jan' });
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).locale).toBe('en');
      sent.length = 0;
      const { message } = await linkFor(email, {}, { 'Accept-Language': 'nl-NL' });
      expect(message.subject).toBe(SUBJECT.en);
    });

    it.each([
      ['name', { name: 'Jan Jansen' }],
      ['metadata', { metadata: { plan: 'premium' } }],
      ['an empty name', { name: '' }],
    ])(
      'refuses a body with %s with 400 MAGIC_LINK_FIELD_NOT_ALLOWED, stores and mails nothing',
      async (_label, extra) => {
        const email = uniqueEmail();
        const res = await requestLink({ email, ...extra });
        expect(res.status).toBe(400);
        expect((res.body as { code: string }).code).toBe('MAGIC_LINK_FIELD_NOT_ALLOWED');
        // The refused value is not echoed back.
        expect(JSON.stringify(res.body)).not.toContain('Jan Jansen');
        expect(JSON.stringify(res.body)).not.toContain('premium');
        expect(sent).toHaveLength(0);
        expect(await prisma.verification.count({ where: { value: { contains: email } } })).toBe(0);
        expect(await prisma.user.count({ where: { email } })).toBe(0);
      },
    );

    it('refuses an invalid email with 400 and mails nothing', async () => {
      const res = await requestLink({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(sent).toHaveLength(0);
      expect(
        await prisma.verification.count({ where: { value: { contains: 'not-an-email' } } }),
      ).toBe(0);
    });

    it('stores the token hashed: the raw token from the link is nowhere in Verification', async () => {
      const email = uniqueEmail();
      const { link } = await linkFor(email);
      const token = link.searchParams.get('token') ?? '';
      expect(token).not.toBe('');
      const rows = await prisma.verification.findMany();
      expect(rows.length).toBeGreaterThan(0);
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it(`sets the link to expire after MAGIC_LINK_TTL_SECONDS (${String(MAGIC_LINK_TTL_SECONDS)} s)`, async () => {
      const email = uniqueEmail();
      const before = Date.now();
      await linkFor(email);
      const after = Date.now();
      const row = await prisma.verification.findFirstOrThrow({
        where: { value: { contains: email } },
      });
      const ttl = MAGIC_LINK_TTL_SECONDS * 1000;
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttl - 1000);
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(after + ttl + 1000);
    });
  });

  describe('following the link', () => {
    it('creates a verified user with the placeholder profile, sets the session cookie and redirects', async () => {
      const email = uniqueEmail();
      const { link } = await linkFor(email, {}, { 'Accept-Language': 'en' });
      const res = await follow(link, { 'Accept-Language': 'en' });
      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe(`${ORIGIN}/`);
      const cookie = sessionCookieOf(res.headers['set-cookie']);
      expect(cookie).toBeDefined();

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerified).toBe(true);
      expect(user.displayUsername).toMatch(PLACEHOLDER);
      expect(user.username).toBe(user.displayUsername);
      expect(user.countryCode).toBe('NL');
      expect(user.locale).toBe('en');
      expect(user.timezone).toBe('Europe/Amsterdam');
      expect(user.avatarUrl).toBeNull();

      const session = await sessionOf(cookie ?? '');
      expect(session?.user.email).toBe(email);
      // Better Auth creates no Account row for a magic-link user: no password comes with it.
      expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    });

    // generateId 'uuid' must keep leaving ids to Postgres uuidv7() (ADR 0004; db-review 2.3).
    it('gives the pending link, the new user and the session database uuidv7 ids', async () => {
      const email = uniqueEmail();
      const { link } = await linkFor(email);
      const pending = await prisma.verification.findFirstOrThrow({
        where: { value: { contains: email } },
      });
      expect(pending.id).toMatch(UUID_V7);

      const res = await follow(link);
      expect(res.status).toBe(302);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.id).toMatch(UUID_V7);
      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toMatch(UUID_V7);
    });

    it('takes the new account locale from the click, not from the request (Better Auth behaviour)', async () => {
      // The create hook sees the headers of the verify request (the browser that opens the
      // link); the Accept-Language of the original request only picks the mail language.
      const email = uniqueEmail();
      const { link, message } = await linkFor(email, {}, { 'Accept-Language': 'en' });
      expect(message.subject).toBe(SUBJECT.en);
      await follow(link);
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).locale).toBe('nl');
    });

    it('redirects a new user to a same-origin newUserCallbackURL and others to callbackURL', async () => {
      const email = uniqueEmail();
      const body = { callbackURL: '/nl', newUserCallbackURL: '/nl/welkom' };
      const first = await follow((await linkFor(email, body)).link);
      expect(first.status).toBe(302);
      expect(first.headers['location']).toBe(`${ORIGIN}/nl/welkom`);
      const second = await follow((await linkFor(email, body)).link);
      expect(second.status).toBe(302);
      expect(second.headers['location']).toBe(`${ORIGIN}/nl`);
    });

    it('signs a known user into the same account', async () => {
      const email = uniqueEmail();
      const first = await follow((await linkFor(email)).link);
      const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
      const second = await follow((await linkFor(email)).link);
      expect(second.status).toBe(302);
      const cookie = sessionCookieOf(second.headers['set-cookie']) ?? '';
      expect(cookie).not.toBe(sessionCookieOf(first.headers['set-cookie']));
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).id).toBe(userId);
      expect((await sessionOf(cookie))?.user.email).toBe(email);
    });

    it('signs in the same account when the address is requested in another case', async () => {
      const email = uniqueEmail();
      await follow((await linkFor(email)).link);
      const res = await requestLink({ email: email.toUpperCase() });
      expect(res.status).toBe(200);
      await vi.waitFor(() => {
        expect(sent.some((m) => m.to.toLowerCase() === email)).toBe(true);
      });
      const message = sent.find((m) => m.to === email.toUpperCase()) as MailMessage;
      const again = await follow(linkOf(message));
      expect(again.status).toBe(302);
      expect(new URL(again.headers['location'] as string).searchParams.get('error')).toBeNull();
      expect(
        await prisma.user.count({ where: { email: { equals: email, mode: 'insensitive' } } }),
      ).toBe(1);
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
    ])(
      'refuses a verify request with a %s callbackURL with 400 CALLBACK_URL_REQUIRED, without a token in the body or using the token',
      async (_label, callbackURL) => {
        const email = uniqueEmail();
        const { link } = await linkFor(email);
        const bare = new URL(link);
        if (callbackURL === undefined) {
          bare.searchParams.delete('callbackURL');
        } else {
          bare.searchParams.set('callbackURL', callbackURL);
        }
        const res = await follow(bare);
        expect(res.status).toBe(400);
        expect((res.body as { code: string }).code).toBe('CALLBACK_URL_REQUIRED');
        expect(res.body).not.toHaveProperty('token');
        expect(res.body).not.toHaveProperty('session');
        expect(sessionCookieOf(res.headers['set-cookie'])).toBeUndefined();
        expect(await prisma.user.count({ where: { email } })).toBe(0);
        // The token was not consumed: the real link still signs in.
        const ok = await follow(link);
        expect(ok.status).toBe(302);
        expect(sessionCookieOf(ok.headers['set-cookie'])).toBeDefined();
      },
    );

    it('works only once: a second click redirects with error=INVALID_TOKEN and no cookie', async () => {
      const email = uniqueEmail();
      const { link } = await linkFor(email);
      expect((await follow(link)).status).toBe(302);
      const again = await follow(link);
      expect(again.status).toBe(302);
      const location = new URL(again.headers['location'] as string);
      expect(location.origin).toBe(ORIGIN);
      expect(location.searchParams.get('error')).toBe('INVALID_TOKEN');
      expect(sessionCookieOf(again.headers['set-cookie'])).toBeUndefined();
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
    });

    it('refuses an expired link and creates no user', async () => {
      const email = uniqueEmail();
      const { link } = await linkFor(email);
      await prisma.verification.updateMany({
        where: { value: { contains: email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await follow(link);
      expect(res.status).toBe(302);
      expect(new URL(res.headers['location'] as string).searchParams.get('error')).toBe(
        'INVALID_TOKEN',
      );
      expect(sessionCookieOf(res.headers['set-cookie'])).toBeUndefined();
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('refuses a tampered or unknown token', async () => {
      const email = uniqueEmail();
      const { link } = await linkFor(email);
      link.searchParams.set('token', `${link.searchParams.get('token') ?? ''}x`);
      const res = await follow(link);
      expect(new URL(res.headers['location'] as string).searchParams.get('error')).toBe(
        'INVALID_TOKEN',
      );
      expect(sessionCookieOf(res.headers['set-cookie'])).toBeUndefined();
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('refuses a verify request whose token is the stored (hashed) value', async () => {
      const email = uniqueEmail();
      await linkFor(email);
      const row = await prisma.verification.findFirstOrThrow({
        where: { value: { contains: email } },
      });
      const stored = row.identifier.replace(/^magic-link:/, '');
      const res = await request(server())
        .get('/api/auth/magic-link/verify')
        .query({ token: stored, callbackURL: '/' });
      expect(new URL(res.headers['location'] as string).searchParams.get('error')).toBe(
        'INVALID_TOKEN',
      );
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('leaves a verified email + password account and its sessions alone', async () => {
      const email = uniqueEmail();
      const old = await signUp(email);
      await prisma.user.update({ where: { email }, data: { emailVerified: true } });
      const res = await follow((await linkFor(email)).link);
      expect(res.status).toBe(302);
      expect((await sessionOf(old))?.user.email).toBe(email);
      expect((await signIn(email)).status).toBe(200);
    });

    // Regression (task 2.3): with generateId false, Better Auth's revokeUnprovenAccountAccess wrote
    // a base64url lock-row id that the uuid Verification.id column refused (500).
    it('promotes an unverified email + password account: verified, old sessions and password revoked', async () => {
      const email = uniqueEmail();
      const old = await signUp(email);
      const other = sessionCookieOf((await signIn(email)).headers['set-cookie']) ?? '';
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(before.emailVerified).toBe(false);
      expect(await prisma.session.count({ where: { userId: before.id } })).toBe(2);

      const res = await follow((await linkFor(email)).link);
      expect(res.status).toBe(302);
      const fresh = sessionCookieOf(res.headers['set-cookie']) ?? '';

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.id).toBe(before.id);
      expect(after.emailVerified).toBe(true);
      // Better Auth's revokeUnprovenAccountAccess: every pre-proof session is gone, only the
      // new one remains.
      expect(await prisma.session.count({ where: { userId: after.id } })).toBe(1);
      expect(await sessionOf(old)).toBeNull();
      expect(await sessionOf(other)).toBeNull();
      expect((await sessionOf(fresh))?.user.email).toBe(email);
      // It also deletes the unproven credential account: the password no longer signs in.
      expect(
        await prisma.account.count({ where: { userId: after.id, providerId: 'credential' } }),
      ).toBe(0);
      expect((await signIn(email)).status).toBe(401);
      // The profile itself is kept.
      expect(after.username).toBe(before.username);
      expect(after.locale).toBe(before.locale);
    });

    it('leaves no lock row and no replayable link after a promotion', async () => {
      const email = uniqueEmail();
      await signUp(email);
      const { link } = await linkFor(email);
      expect((await follow(link)).status).toBe(302);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerified).toBe(true);
      const replay = await follow(link);
      expect(new URL(replay.headers['location'] as string).searchParams.get('error')).toBe(
        'INVALID_TOKEN',
      );
      // Better Auth's lock row holds the plain user id as its value (the identifier is hashed).
      expect(await prisma.verification.count({ where: { value: user.id } })).toBe(0);
    });
  });

  describe('origin and callback checks', () => {
    it.each(['callbackURL', 'newUserCallbackURL', 'errorCallbackURL'])(
      'refuses a request whose %s points at a foreign origin with 403 and mails nothing',
      async (field) => {
        const email = uniqueEmail();
        const res = await requestLink({ email, [field]: `${EVIL}/` });
        expect(res.status).toBe(403);
        expect(sent).toHaveLength(0);
        expect(await prisma.verification.count({ where: { value: { contains: email } } })).toBe(0);
      },
    );

    it.each(['callbackURL', 'newUserCallbackURL', 'errorCallbackURL'])(
      'refuses a verify link whose %s was changed to a foreign origin, without using the token',
      async (field) => {
        const email = uniqueEmail();
        const { link } = await linkFor(email);
        const tampered = new URL(link);
        tampered.searchParams.set(field, `${EVIL}/`);
        const res = await follow(tampered);
        expect(res.status).toBe(403);
        expect(res.headers['location']).toBeUndefined();
        expect(sessionCookieOf(res.headers['set-cookie'])).toBeUndefined();
        expect(await prisma.user.count({ where: { email } })).toBe(0);
        // The token was not consumed by the refused attempt.
        const ok = await follow(link);
        expect(sessionCookieOf(ok.headers['set-cookie'])).toBeDefined();
      },
    );

    it('refuses a request from a foreign Origin with 403 and mails nothing', async () => {
      const email = uniqueEmail();
      const res = await requestLink(
        { email },
        { Origin: EVIL, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors' },
      );
      expect(res.status).toBe(403);
      expect(sent).toHaveLength(0);
    });

    it('refuses a foreign Origin even without Fetch Metadata headers', async () => {
      const email = uniqueEmail();
      const res = await requestLink({ email }, { Origin: EVIL });
      expect(res.status).toBe(403);
      expect(sent).toHaveLength(0);
    });

    it('refuses a cross-site form navigation (login CSRF) with 403', async () => {
      const email = uniqueEmail();
      const res = await requestLink(
        { email },
        {
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Dest': 'document',
        },
      );
      expect(res.status).toBe(403);
      expect(sent).toHaveLength(0);
    });

    it('refuses a browser request (Fetch Metadata) that has no Origin with 403', async () => {
      const email = uniqueEmail();
      const res = await requestLink(
        { email },
        { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors' },
      );
      expect(res.status).toBe(403);
      expect(sent).toHaveLength(0);
    });

    it('refuses a cookie-carrying request without Origin with 403', async () => {
      const cookie = await signUp(uniqueEmail());
      sent.length = 0;
      const email = uniqueEmail();
      const res = await requestLink({ email }, { Cookie: cookie });
      expect(res.status).toBe(403);
      expect(sent).toHaveLength(0);
    });

    it('accepts a non-browser request without Origin, cookie or Fetch Metadata (Better Auth behaviour)', async () => {
      // Documents Better Auth 1.7's formCsrfMiddleware: with none of those headers there is no
      // browser to forge a request through, so it is let through. Rate limits (task 2.10) and
      // Turnstile still apply to such clients.
      const email = uniqueEmail();
      const res = await requestLink({ email }, {});
      expect(res.status).toBe(200);
      await vi.waitFor(() => {
        expect(mailsTo(email)).toHaveLength(1);
      });
    });
  });
});
