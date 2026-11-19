import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@guesshive/shared';

/**
 * An error with a stable machine-readable code (AGENTS.md §7), e.g.
 * `throw new ApiException(HttpStatus.CONFLICT, 'VOTE_ALREADY_CAST', 'Vote already cast')`.
 * `message` is English and for developers; the web app translates `code`. It is sent to the
 * client as written, so keep it a fixed literal: no interpolated user data, emails or ids.
 */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super({ code, message }, status);
  }
}
