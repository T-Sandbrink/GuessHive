import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { createAuth } from './auth.config.js';
import { AUTH } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { emailPasswordMethod } from './email-password.js';
import { SessionMiddleware } from './session.middleware.js';

/**
 * Authentication with Better Auth (task 2.1, ADR 0006): our own thin integration. The controller
 * serves `/api/auth/*`; SessionMiddleware puts the signed-in user on every other request.
 */
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH,
      inject: [PrismaService, API_ENV, SettingsService, MailService],
      useFactory: (
        prisma: PrismaService,
        env: ApiEnv,
        settings: SettingsService,
        mail: MailService,
      ) => createAuth(prisma, env, settings, emailPasswordMethod(mail)),
    },
  ],
  exports: [AUTH],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('{*path}');
  }
}
