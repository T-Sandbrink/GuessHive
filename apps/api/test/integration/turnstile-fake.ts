import type { TurnstileVerifier } from '../../src/auth/turnstile.js';

/** A Turnstile check that always passes, for tests about other parts of sign-up (task 2.9). */
export const PASS_TURNSTILE: TurnstileVerifier = () => Promise.resolve({ ok: true });

/** The header a passing request carries; PASS_TURNSTILE accepts any non-empty token. */
export const TURNSTILE_OK = { 'x-turnstile-token': 'test-token' };
