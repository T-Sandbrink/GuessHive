import { All, Controller, HttpStatus, Inject, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { ApiException } from '../common/api.exception.js';
import type { Auth } from './auth.config.js';
import { AUTH } from './auth.constants.js';
import { Public } from './auth.decorators.js';

/** True when the request announces a body (a positive Content-Length or chunked encoding). */
function announcesBody(req: Request): boolean {
  return (
    req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length']) > 0
  );
}

/**
 * Hands every `/api/auth/*` request to Better Auth (task 2.1, ADR 0006). Running it as a Nest
 * controller, not as loose Express middleware, keeps the global guards (rate limits now, auth
 * and Turnstile in later tasks) in force.
 */
@ApiExcludeController()
@Controller('api/auth')
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(AUTH) auth: Auth) {
    this.handler = toNodeHandler(auth);
  }

  // Public: sign-in has no session yet, and Better Auth checks the session on the routes that
  // need one (sign-out, revoke-sessions). Suspended or banned users can still sign out. On the
  // handler, not the class, so a handler added here later is not public by accident.
  // RolesGuard never protects Better Auth routes: a plugin endpoint that needs a role must be
  // checked by Better Auth itself, or disabled.
  @Public()
  @All('{*path}')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Nest's JSON and urlencoded parsers (100 kb limit) have read every body Better Auth
    // accepts, and Better Auth reuses the parsed body. A body they skipped (another content
    // type) would be streamed without a size limit, so it is refused.
    if (announcesBody(req) && !req.readableEnded) {
      throw new ApiException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'UNSUPPORTED_MEDIA_TYPE',
        'Unsupported media type',
      );
    }
    await this.handler(req, res);
  }
}
