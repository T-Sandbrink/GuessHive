import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { MailMessage } from '../../src/mail/mail.service.js';
import { MailService } from '../../src/mail/mail.service.js';
import { RATE_LIMIT_KEY_PREFIX } from '../../src/rate-limit/rate-limit.constants.js';
import {
  SETTINGS_CACHE_PREFIX,
  SETTINGS_GENERATION_PREFIX,
  SettingsService,
} from '../../src/settings/settings.service.js';
import { testRedisUrl } from './test-db-url.js';
import { createTestPrisma, resetDatabase } from './test-db.js';

/** The web origin Better Auth trusts in tests (the BETTER_AUTH_URL default). */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery'; // 21 characters
const NEW_PASSWORD = 'a-brand-new-passphrase';
const SETTING = 'auth.passwordMinLength';

/** The session cookie (name=value) from a Set-Cookie list, or undefined. */
function sessionCookieOf(setCookie: string[] | string | undefined): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie];
  return list.find((c) => c.startsWith('guesshive.session_token='))?.split(';', 1)[0];
}

let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `mailflow${String(counter)}@guesshive.test`;
}

/** The first link in a message's plain text. */
function linkOf(message: MailMessage): URL {
  const match = /https?:\/\/\S+/.exec(message.text);
  if (match === null) {
    throw new Error('no link in the mail');
  }
  return new URL(match[0]);
}

// Email + password (task 2.2) through the real AppModule wiring (AuthModule with
// emailPasswordMethod, SettingsService on Postgres + Redis). Only MailService is replaced by a
// capturing fake, so the flows run without Mailpit (CI has no Mailpit service).
describe('email + password sign-in (task 2.2)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let redis: Redis;
  let settings: SettingsService;
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

  async function signUp(
    email = uniqueEmail(),
    password = PASSWORD,
    headers: Record<string, string> = {},
  ): Promise<{ res: request.Response; email: string }> {
    const res = await request(server())
      .post('/api/auth/sign-up/email')
      .set({ Origin: ORIGIN, ...headers })
      .send({ email, password, name: 'Jan' });
    return { res, email };
  }

  async function signIn(email: string, password: string): Promise<request.Response> {
    return request(server())
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password });
  }

  async function clearSettingCache(): Promise<void> {
    await redis.del(SETTINGS_CACHE_PREFIX + SETTING, SETTINGS_GENERATION_PREFIX + SETTING);
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    redis = new Redis(testRedisUrl(), { lazyConnect: true });
    await redis.connect();
    await clearSettingCache();
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
    settings = app.get(SettingsService);
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

  afterEach(async () => {
    // Back to the default (12) for the next test.
    await prisma.appSetting.deleteMany({ where: { key: SETTING } });
    await clearSettingCache();
  });

  afterAll(async () => {
    await app.close();
    await clearSettingCache();
    await resetDatabase(prisma);
    await prisma.$disconnect();
    await redis.quit();
  });

  describe('sign-up', () => {
    it('creates the account with a 12+ character password and signs in', async () => {
      const { res, email } = await signUp(undefined, 'x'.repeat(12));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(sessionCookieOf(res.headers['set-cookie'])).toBeDefined();
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerified).toBe(false);
    });

    it.each([
      ['nl', 'nl-NL,nl;q=0.9', 'Bevestig je e-mailadres voor GuessHive'],
      ['en', 'en-GB,en;q=0.9', 'Confirm your email address for GuessHive'],
    ])(
      'sends one verification mail to the address, in the user locale (%s)',
      async (locale, acceptLanguage, subject) => {
        const { res, email } = await signUp(undefined, PASSWORD, {
          'Accept-Language': acceptLanguage,
        });
        expect(res.status).toBe(200);
        expect((await prisma.user.findUniqueOrThrow({ where: { email } })).locale).toBe(locale);
        await vi.waitFor(() => {
          expect(mailsTo(email)).toHaveLength(1);
        });
        const [message] = mailsTo(email);
        expect(message?.subject).toBe(subject);
        expect(message?.html).toContain(`<html lang="${locale}">`);
        // The mail goes through the fire-and-forget path only.
        expect(mail.send).not.toHaveBeenCalled();
        const link = linkOf(message as MailMessage);
        expect(link.origin).toBe(ORIGIN);
        expect(link.pathname).toBe('/api/auth/verify-email');
        expect(link.searchParams.get('token')).toBeTruthy();
      },
    );

    it('refuses a password shorter than the setting with 400 PASSWORD_TOO_SHORT and no user', async () => {
      const { res, email } = await signUp(undefined, 'x'.repeat(11));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'PASSWORD_TOO_SHORT', minLength: 12 });
      expect(JSON.stringify(res.body)).not.toContain('x'.repeat(11));
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      expect(sessionCookieOf(res.headers['set-cookie'])).toBeUndefined();
      expect(sent).toHaveLength(0);
    });

    it('follows a changed setting at once: 8 allows 8, 20 refuses 19', async () => {
      const admin = await signUp();
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })).id;

      await settings.update(SETTING, 8, adminId);
      const eight = await signUp(undefined, 'x'.repeat(8));
      expect(eight.res.status, JSON.stringify(eight.res.body)).toBe(200);
      const seven = await signUp(undefined, 'x'.repeat(7));
      expect(seven.res.status).toBe(400);
      // Below the hard floor Better Auth itself refuses as well.
      expect(await prisma.user.count({ where: { email: seven.email } })).toBe(0);

      await settings.update(SETTING, 20, adminId);
      const nineteen = await signUp(undefined, 'x'.repeat(19));
      expect(nineteen.res.status).toBe(400);
      expect(nineteen.res.body).toMatchObject({ code: 'PASSWORD_TOO_SHORT', minLength: 20 });
      expect(await prisma.user.count({ where: { email: nineteen.email } })).toBe(0);
    });

    it('answers an existing email with 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL (option A, owner decision pending)', async () => {
      const { email } = await signUp();
      sent.length = 0;
      const again = await signUp(email, 'another-long-password');
      // Documents today's behaviour: it reveals that the address has an account. If the owner
      // picks the enumeration-safe option, this test must change with it.
      expect(again.res.status).toBe(422);
      expect((again.res.body as { code: string }).code).toBe(
        'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
      );
      expect(sessionCookieOf(again.res.headers['set-cookie'])).toBeUndefined();
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      // The first password still works, and no second verification mail was sent.
      expect((await signIn(email, PASSWORD)).status).toBe(200);
      expect(mailsTo(email)).toHaveLength(0);
    });

    it('refuses a password over 128 characters', async () => {
      const { res, email } = await signUp(undefined, 'x'.repeat(129));
      expect(res.status).toBe(400);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('accepts exactly 128 characters', async () => {
      const { res } = await signUp(undefined, 'x'.repeat(128));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });
  });

  describe('sign-in', () => {
    it('signs in with the right password', async () => {
      const { email } = await signUp();
      const res = await signIn(email, PASSWORD);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(sessionCookieOf(res.headers['set-cookie'])).toBeDefined();
    });

    it('signs in with the email in another case', async () => {
      const { email } = await signUp();
      const res = await signIn(email.toUpperCase(), PASSWORD);
      expect(res.status).toBe(200);
    });

    it('gives the same generic error for a wrong password and an unknown email', async () => {
      const { email } = await signUp();
      const wrong = await signIn(email, 'not-the-right-password');
      const unknown = await signIn('nobody-here@guesshive.test', PASSWORD);
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(wrong.status);
      expect(unknown.body).toEqual(wrong.body);
      expect((wrong.body as { code: string }).code).toBe('INVALID_EMAIL_OR_PASSWORD');
      expect(sessionCookieOf(wrong.headers['set-cookie'])).toBeUndefined();
      expect(sessionCookieOf(unknown.headers['set-cookie'])).toBeUndefined();
    });

    it('is not blocked by the minimum length (an old shorter password still signs in)', async () => {
      const admin = await signUp();
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })).id;
      await settings.update(SETTING, 8, adminId);
      const { email } = await signUp(undefined, 'shortpw1');
      await settings.update(SETTING, 16, adminId);
      expect((await signIn(email, 'shortpw1')).status).toBe(200);
    });

    it('signs in without a verified email (verification is not required)', async () => {
      const { email } = await signUp();
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false);
      expect((await signIn(email, PASSWORD)).status).toBe(200);
    });
  });

  describe('email verification', () => {
    it('sets emailVerified with the link from the mail', async () => {
      const { email } = await signUp();
      await vi.waitFor(() => {
        expect(mailsTo(email)).toHaveLength(1);
      });
      const link = linkOf(mailsTo(email)[0] as MailMessage);
      const res = await request(server()).get(`${link.pathname}${link.search}`);
      expect(res.status).toBeLessThan(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);
    });

    it('refuses a tampered token and leaves the address unverified', async () => {
      const { email } = await signUp();
      await vi.waitFor(() => {
        expect(mailsTo(email)).toHaveLength(1);
      });
      const link = linkOf(mailsTo(email)[0] as MailMessage);
      link.searchParams.set('token', `${link.searchParams.get('token') ?? ''}x`);
      await request(server()).get(`${link.pathname}${link.search}`);
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false);
    });
  });

  describe('password reset', () => {
    async function requestReset(email: string): Promise<request.Response> {
      return request(server())
        .post('/api/auth/request-password-reset')
        .set('Origin', ORIGIN)
        .send({ email, redirectTo: '/nl/wachtwoord-herstellen' });
    }

    /** The reset token from the mail: the link's path ends in /reset-password/<token>. */
    async function resetTokenFor(email: string): Promise<{ token: string; message: MailMessage }> {
      await vi.waitFor(() => {
        expect(mailsTo(email).some((m) => linkOf(m).pathname.includes('/reset-password/'))).toBe(
          true,
        );
      });
      const message = mailsTo(email).find((m) =>
        linkOf(m).pathname.includes('/reset-password/'),
      ) as MailMessage;
      const token = linkOf(message).pathname.split('/').at(-1) ?? '';
      expect(token).not.toBe('');
      return { token, message };
    }

    it('answers an existing and an unknown email the same way, and mails only the first', async () => {
      const { email } = await signUp();
      sent.length = 0;
      const known = await requestReset(email);
      const unknown = await requestReset('nobody-here@guesshive.test');
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
      await vi.waitFor(() => {
        expect(mailsTo(email)).toHaveLength(1);
      });
      expect(mailsTo('nobody-here@guesshive.test')).toHaveLength(0);
    });

    it.each([
      ['nl', 'nl-NL', 'Kies een nieuw wachtwoord voor GuessHive'],
      ['en', 'en-US', 'Choose a new GuessHive password'],
    ])('mails the reset link in the user locale (%s)', async (_locale, acceptLanguage, subject) => {
      const { email } = await signUp(undefined, PASSWORD, { 'Accept-Language': acceptLanguage });
      await requestReset(email);
      const { message } = await resetTokenFor(email);
      expect(message.subject).toBe(subject);
    });

    it('sets the new password with the token from the mail and revokes every session', async () => {
      const { res: signUpRes, email } = await signUp();
      const first = sessionCookieOf(signUpRes.headers['set-cookie']);
      const second = sessionCookieOf((await signIn(email, PASSWORD)).headers['set-cookie']);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(2);

      await requestReset(email);
      const { token } = await resetTokenFor(email);
      const res = await request(server())
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token, newPassword: NEW_PASSWORD });
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      expect((await signIn(email, PASSWORD)).status).toBe(401);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
      for (const cookie of [first, second]) {
        const session = await request(server())
          .get('/api/auth/get-session')
          .set('Cookie', cookie ?? '');
        expect(session.body).toBeNull();
      }
      expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
    });

    it('can use a token only once', async () => {
      const { email } = await signUp();
      await requestReset(email);
      const { token } = await resetTokenFor(email);
      const once = await request(server())
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token, newPassword: NEW_PASSWORD });
      expect(once.status).toBe(200);
      const twice = await request(server())
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token, newPassword: 'yet-another-passphrase' });
      expect(twice.status).toBe(400);
      expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
    });

    it('refuses a too short newPassword with PASSWORD_TOO_SHORT and keeps the token and password', async () => {
      const { email } = await signUp();
      await requestReset(email);
      const { token } = await resetTokenFor(email);
      const res = await request(server())
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token, newPassword: 'x'.repeat(11) });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'PASSWORD_TOO_SHORT', minLength: 12 });
      expect((await signIn(email, PASSWORD)).status).toBe(200);
      // The token was not used up by the refused attempt.
      const retry = await request(server())
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token, newPassword: NEW_PASSWORD });
      expect(retry.status).toBe(200);
    });

    it('refuses an unknown token', async () => {
      const res = await request(server())
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({ token: 'not-a-real-token', newPassword: NEW_PASSWORD });
      expect(res.status).toBe(400);
    });

    it('stores the reset token hashed, never as sent in the mail', async () => {
      const { email } = await signUp();
      await requestReset(email);
      const { token } = await resetTokenFor(email);
      const rows = await prisma.verification.findMany();
      expect(JSON.stringify(rows)).not.toContain(token);
    });
  });

  describe('change password', () => {
    it('refuses a too short newPassword with PASSWORD_TOO_SHORT', async () => {
      const { res: up } = await signUp();
      const cookie = sessionCookieOf(up.headers['set-cookie']) ?? '';
      const res = await request(server())
        .post('/api/auth/change-password')
        .set({ Origin: ORIGIN, Cookie: cookie })
        .send({ currentPassword: PASSWORD, newPassword: 'x'.repeat(11) });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
    });

    it.each([
      ['asks not to', { revokeOtherSessions: false }],
      ['does not say', {}],
    ])('always signs out the other sessions when the client %s', async (_label, extra) => {
      const { res: up, email } = await signUp();
      const current = sessionCookieOf(up.headers['set-cookie']) ?? '';
      const other = sessionCookieOf((await signIn(email, PASSWORD)).headers['set-cookie']) ?? '';
      const res = await request(server())
        .post('/api/auth/change-password')
        .set({ Origin: ORIGIN, Cookie: current })
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, ...extra });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const otherSession = await request(server())
        .get('/api/auth/get-session')
        .set('Cookie', other);
      expect(otherSession.body).toBeNull();
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);
      expect((await signIn(email, PASSWORD)).status).toBe(401);
      expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
    });

    it('refuses a change without a session with 401', async () => {
      const res = await request(server())
        .post('/api/auth/change-password')
        .set('Origin', ORIGIN)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(401);
    });

    it('refuses a wrong current password and keeps the old one', async () => {
      const { res: up, email } = await signUp();
      const cookie = sessionCookieOf(up.headers['set-cookie']) ?? '';
      const res = await request(server())
        .post('/api/auth/change-password')
        .set({ Origin: ORIGIN, Cookie: cookie })
        .send({ currentPassword: 'not-the-current-one', newPassword: NEW_PASSWORD });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect((await signIn(email, PASSWORD)).status).toBe(200);
    });
  });
});

// The real MailService against the docker compose Mailpit. Skipped when Mailpit is not
// reachable (CI has no Mailpit service).
const mailpitUrl = process.env['MAILPIT_URL'] ?? 'http://127.0.0.1:8025';
const mailpitUp = await fetch(new URL('/api/v1/info', mailpitUrl), {
  signal: AbortSignal.timeout(1_000),
})
  .then((res) => res.ok)
  .catch(() => false);

describe.skipIf(!mailpitUp)('email + password with Mailpit delivery (task 2.2)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  const runId = Date.now().toString(36);
  const email = `mailpit-${runId}@guesshive.test`;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await prisma.country.upsert({
      where: { code: 'NL' },
      update: {},
      create: { code: 'NL', names: { nl: 'Nederland', en: 'Netherlands' } },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    const found = (await (
      await fetch(
        new URL(`/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`, mailpitUrl),
      )
    ).json()) as { messages: { ID: string }[] };
    if (found.messages.length > 0) {
      await fetch(new URL('/api/v1/messages', mailpitUrl), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: found.messages.map((m) => m.ID) }),
      });
    }
    await app.close();
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it('delivers the verification mail to Mailpit, and its link verifies the address', async () => {
    const res = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/auth/sign-up/email')
      .set({ Origin: ORIGIN, 'Accept-Language': 'en' })
      .send({ email, password: PASSWORD, name: 'Jan' });
    expect(res.status).toBe(200);
    let id = '';
    await vi.waitFor(
      async () => {
        const found = (await (
          await fetch(
            new URL(`/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`, mailpitUrl),
          )
        ).json()) as { messages: { ID: string; Subject: string; From: { Address: string } }[] };
        expect(found.messages).toHaveLength(1);
        expect(found.messages[0]?.Subject).toBe('Confirm your email address for GuessHive');
        expect(found.messages[0]?.From.Address).toBe('noreply@guesshive.test');
        id = found.messages[0]?.ID ?? '';
      },
      { timeout: 5_000, interval: 100 },
    );
    const message = (await (await fetch(new URL(`/api/v1/message/${id}`, mailpitUrl))).json()) as {
      Text: string;
      HTML: string;
    };
    expect(message.HTML).toContain('<html lang="en">');
    const link = linkOf({ to: email, subject: '', text: message.Text, html: '' });
    await request(app.getHttpServer()).get(`${link.pathname}${link.search}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);
  });
});
