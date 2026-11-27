import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { registerQueue } from '../queue/logged-bullmq.js';
import { QUEUE_NAMES } from '../queue/queue.constants.js';
import { createAuth } from './auth.config.js';
import { AUTH } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { SessionCleanupProcessor, SessionCleanupScheduler } from './session-cleanup.processor.js';
import { SessionCleanupService } from './session-cleanup.service.js';
import { SessionMiddleware } from './session.middleware.js';

/**
 * Authentication with Better Auth (task 2.1, ADR 0006): our own thin integration. The controller
 * serves `/api/auth/*`; SessionMiddleware puts the signed-in user on every other request. An
 * hourly job on the `auth` queue removes expired sessions and verification values (task 2.7).
 */
@Module({
  imports: [registerQueue(QUEUE_NAMES.auth)],
  controllers: [AuthController],
  providers: [
    SessionCleanupService,
    SessionCleanupProcessor,
    SessionCleanupScheduler,
    {
      provide: AUTH,
      inject: [PrismaService, API_ENV],
      useFactory: (prisma: PrismaService, env: ApiEnv) => createAuth(prisma, env),
    },
  ],
  exports: [AUTH],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('{*path}');
  }
}
