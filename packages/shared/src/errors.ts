import { z } from 'zod';

/**
 * Machine-readable error codes in every api error body (`{ code, message }`, AGENTS.md §7).
 * The web app maps a code to a translated message; `message` is English and for developers only.
 * Domain modules add their own codes here (e.g. `VOTE_ALREADY_CAST`).
 */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** The JSON body of every api error response; the web app validates it at the boundary. */
export const apiErrorBodySchema = z.object({
  code: z.enum(API_ERROR_CODES),
  message: z.string(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
