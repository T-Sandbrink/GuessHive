import { Inject, Injectable, Logger } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';

/** One email, ready to send. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** A send the provider refused or that did not complete; carries no personal data. */
export class MailSendError extends Error {
  override readonly name = 'MailSendError';

  constructor(
    readonly status: number | undefined,
    readonly reason: string,
  ) {
    super(`Mail send failed: ${reason}`);
  }
}

/** The fetch failure code (`ECONNREFUSED`, `TimeoutError`, …), never a message. */
export function failureCode(error: unknown): string {
  if (error instanceof Error) {
    const cause: unknown = error.cause;
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      typeof cause.code === 'string'
    ) {
      return cause.code;
    }
    return error.name;
  }
  return 'unknown';
}

/** How long a send may take before it is abandoned. */
export const MAIL_TIMEOUT_MS = 10_000;
const RESEND_URL = 'https://api.resend.com/emails';

/** Parses `Name <address>` (or a bare address) for Mailpit's api. */
export function parseSender(from: string): { Email: string; Name: string } {
  const match = /^\s*(.*?)\s*<([^<>\s]+)>\s*$/.exec(from);
  if (match !== null) {
    return { Name: match[1] ?? '', Email: match[2] ?? '' };
  }
  return { Name: '', Email: from.trim() };
}

/**
 * Sends email over HTTP (task 2.2): Mailpit's send api locally, Resend's api in production.
 * No SMTP library is needed. Logs never contain addresses, subjects or links (AGENTS.md §8).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  /** Sends a message; throws MailSendError when the provider refuses it or does not answer. */
  async send(message: MailMessage): Promise<void> {
    let response: Response;
    try {
      response =
        this.env.MAIL_TRANSPORT === 'resend'
          ? await this.sendResend(message)
          : await this.sendMailpit(message);
    } catch (error) {
      throw new MailSendError(undefined, failureCode(error));
    }
    if (!response.ok) {
      throw new MailSendError(response.status, `provider answered ${String(response.status)}`);
    }
  }

  /**
   * Sends without waiting, for auth flows: a reset request then answers alike for known and
   * unknown addresses, and a mail outage never blocks sign-up. Failures are logged with the
   * provider status or failure code only. A send still running at shutdown is lost; the user can
   * request the mail again.
   */
  sendInBackground(message: MailMessage): void {
    this.send(message).catch((error: unknown) => {
      const detail = error instanceof MailSendError ? error.reason : failureCode(error);
      this.logger.warn(`Sending mail failed (${this.env.MAIL_TRANSPORT}: ${detail})`);
    });
  }

  private sendMailpit(message: MailMessage): Promise<Response> {
    return fetch(new URL('/api/v1/send', this.env.MAILPIT_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: parseSender(this.env.MAIL_FROM),
        To: [{ Email: message.to }],
        Subject: message.subject,
        Text: message.text,
        HTML: message.html,
      }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    });
  }

  private sendResend(message: MailMessage): Promise<Response> {
    return fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.env.RESEND_API_KEY ?? ''}`,
      },
      body: JSON.stringify({
        from: this.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    });
  }
}
