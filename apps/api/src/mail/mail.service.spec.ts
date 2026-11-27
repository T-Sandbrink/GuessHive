import { Logger } from '@nestjs/common';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.js';
import {
  MAIL_TIMEOUT_MS,
  type MailMessage,
  MailSendError,
  MailService,
  failureCode,
  parseSender,
} from './mail.service.js';

const MESSAGE: MailMessage = {
  to: 'jan.jansen@example.test',
  subject: 'Bevestig je e-mailadres voor GuessHive',
  text: 'Klik: https://guesshive.test/api/auth/verify-email?token=secret-token',
  html: '<p><a href="https://guesshive.test/api/auth/verify-email?token=secret-token">x</a></p>',
};

const MAILPIT_ENV = {
  MAIL_TRANSPORT: 'mailpit',
  MAILPIT_URL: 'http://127.0.0.1:8025',
  MAIL_FROM: 'GuessHive <noreply@guesshive.test>',
} as ApiEnv;

const RESEND_ENV = {
  MAIL_TRANSPORT: 'resend',
  MAILPIT_URL: 'http://127.0.0.1:8025',
  RESEND_API_KEY: 're_unit_test_key',
  MAIL_FROM: 'GuessHive <hallo@guesshive.example>',
} as ApiEnv;

type FetchArgs = [URL | string, RequestInit];

describe('parseSender (task 2.2)', () => {
  it.each([
    ['GuessHive <noreply@guesshive.test>', { Name: 'GuessHive', Email: 'noreply@guesshive.test' }],
    [
      '  GuessHive  <noreply@guesshive.test>  ',
      { Name: 'GuessHive', Email: 'noreply@guesshive.test' },
    ],
    ['"Guess Hive" <a@b.test>', { Name: '"Guess Hive"', Email: 'a@b.test' }],
    ['<noreply@guesshive.test>', { Name: '', Email: 'noreply@guesshive.test' }],
    ['noreply@guesshive.test', { Name: '', Email: 'noreply@guesshive.test' }],
    ['  noreply@guesshive.test  ', { Name: '', Email: 'noreply@guesshive.test' }],
    [
      'De Bij van GuessHive <bij@guesshive.test>',
      { Name: 'De Bij van GuessHive', Email: 'bij@guesshive.test' },
    ],
  ])('parses %j', (from, expected) => {
    expect(parseSender(from)).toEqual(expected);
  });

  it('treats a malformed angle address as a bare address', () => {
    expect(parseSender('GuessHive <a b@c.test>')).toEqual({
      Name: '',
      Email: 'GuessHive <a b@c.test>',
    });
  });
});

describe('MailService (task 2.2)', () => {
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function lastCall(): { url: string; init: RequestInit; body: Record<string, unknown> } {
    const [url, init] = fetchMock.mock.calls.at(-1) as FetchArgs;
    return {
      url: String(url),
      init,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    };
  }

  it('posts to the Mailpit send api with its field names', async () => {
    await new MailService(MAILPIT_ENV).send(MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = lastCall();
    expect(url).toBe('http://127.0.0.1:8025/api/v1/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(body).toEqual({
      From: { Name: 'GuessHive', Email: 'noreply@guesshive.test' },
      To: [{ Email: MESSAGE.to }],
      Subject: MESSAGE.subject,
      Text: MESSAGE.text,
      HTML: MESSAGE.html,
    });
  });

  it('resolves the Mailpit path against the origin of MAILPIT_URL', async () => {
    await new MailService({ ...MAILPIT_ENV, MAILPIT_URL: 'http://mailpit:8025/ui/' }).send(MESSAGE);
    expect(lastCall().url).toBe('http://mailpit:8025/api/v1/send');
  });

  it('posts to the Resend api with the key as a bearer token', async () => {
    await new MailService(RESEND_ENV).send(MESSAGE);
    const { url, init, body } = lastCall();
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer re_unit_test_key',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(body).toEqual({
      from: 'GuessHive <hallo@guesshive.example>',
      to: [MESSAGE.to],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it('never calls Mailpit when Resend is configured, and the other way round', async () => {
    await new MailService(RESEND_ENV).send(MESSAGE);
    await new MailService(MAILPIT_ENV).send(MESSAGE);
    const urls = fetchMock.mock.calls.map(([url]) => String(url as URL | string));
    expect(urls).toEqual(['https://api.resend.com/emails', 'http://127.0.0.1:8025/api/v1/send']);
  });

  it('times out after MAIL_TIMEOUT_MS', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await new MailService(MAILPIT_ENV).send(MESSAGE);
    expect(timeout).toHaveBeenCalledWith(MAIL_TIMEOUT_MS);
    expect(MAIL_TIMEOUT_MS).toBe(10_000);
  });

  it.each([400, 401, 422, 500, 503])(
    'throws MailSendError when the provider answers %i',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('nope', { status }));
      const error: unknown = await new MailService(RESEND_ENV)
        .send(MESSAGE)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MailSendError);
      expect(error).toMatchObject({
        name: 'MailSendError',
        status,
        reason: `provider answered ${String(status)}`,
      });
    },
  );

  it('wraps a network error in MailSendError with its cause code only', async () => {
    const cause = Object.assign(new Error(`connect ECONNREFUSED for ${MESSAGE.to}`), {
      code: 'ECONNREFUSED',
    });
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause }));
    const error: unknown = await new MailService(MAILPIT_ENV)
      .send(MESSAGE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailSendError);
    expect(error).toMatchObject({ status: undefined, reason: 'ECONNREFUSED' });
    expect(JSON.stringify(error)).not.toContain(MESSAGE.to);
    expect((error as Error).message).not.toContain(MESSAGE.to);
  });

  it('wraps a timeout in MailSendError as TimeoutError', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(new MailService(MAILPIT_ENV).send(MESSAGE)).rejects.toMatchObject({
      name: 'MailSendError',
      reason: 'TimeoutError',
    });
  });

  describe('sendInBackground', () => {
    it('sends the message without returning a promise', async () => {
      new MailService(MAILPIT_ENV).sendInBackground(MESSAGE);
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    it.each([
      ['a non-2xx answer', () => Promise.resolve(new Response('', { status: 500 }))],
      ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
      ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ])('never throws on %s and logs no address, subject or link', async (_label, impl) => {
      fetchMock.mockImplementation(impl);
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        expect(() => {
          new MailService(RESEND_ENV).sendInBackground(MESSAGE);
        }).not.toThrow();
        await vi.waitFor(() => {
          expect(warn).toHaveBeenCalledTimes(1);
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(unhandled).not.toHaveBeenCalled();
        const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
        expect(logged).toMatch(/Sending mail failed/);
        for (const secret of [
          MESSAGE.to,
          'jan.jansen',
          MESSAGE.subject,
          'secret-token',
          'verify-email',
          're_unit_test_key',
        ]) {
          expect(logged).not.toContain(secret);
        }
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });

    it.each([
      ['mailpit', MAILPIT_ENV],
      ['resend', RESEND_ENV],
    ] as const)('logs the transport and provider status (%s)', async (transport, env) => {
      fetchMock.mockResolvedValue(new Response('', { status: 422 }));
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      new MailService(env).sendInBackground(MESSAGE);
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith(
          `Sending mail failed (${transport}: provider answered 422)`,
        );
      });
    });

    it('logs the failure code, never the error message', async () => {
      const cause = Object.assign(new Error(`getaddrinfo failed for ${MESSAGE.to}`), {
        code: 'ENOTFOUND',
      });
      fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${MESSAGE.to}`, { cause }));
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      new MailService(MAILPIT_ENV).sendInBackground(MESSAGE);
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith('Sending mail failed (mailpit: ENOTFOUND)');
      });
    });

    it('logs the error name for a rejection without a cause code', async () => {
      fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${MESSAGE.to}`));
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      new MailService(MAILPIT_ENV).sendInBackground(MESSAGE);
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith('Sending mail failed (mailpit: TypeError)');
      });
    });

    it('logs "unknown" for a rejection that is not an Error', async () => {
      fetchMock.mockRejectedValue(Object.create(null));
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      new MailService(MAILPIT_ENV).sendInBackground(MESSAGE);
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith('Sending mail failed (mailpit: unknown)');
      });
    });
  });
});

describe('failureCode (task 2.2)', () => {
  it('prefers a string cause code', () => {
    expect(failureCode(new Error('x', { cause: { code: 'ECONNRESET' } }))).toBe('ECONNRESET');
  });

  it('falls back to the error name for a missing or non-string cause code', () => {
    expect(failureCode(new TypeError('x'))).toBe('TypeError');
    expect(failureCode(new Error('x', { cause: { code: 42 } }))).toBe('Error');
    expect(failureCode(new Error('x', { cause: 'ECONNRESET' }))).toBe('Error');
    expect(failureCode(new DOMException('t', 'AbortError'))).toBe('AbortError');
  });

  it.each([undefined, null, 'ECONNREFUSED', 42, { code: 'X' }])(
    'returns unknown for the non-Error %j',
    (value) => {
      expect(failureCode(value)).toBe('unknown');
    },
  );

  it('never returns the message', () => {
    expect(failureCode(new Error('secret jan@example.test'))).not.toContain('jan@');
  });
});
