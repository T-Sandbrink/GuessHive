import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { createValidationPipe } from './common/validation.js';
import { ConfigModule } from './config/config.module.js';
import { FlagsModule } from './flags/flags.module.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from './logging/logger.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SettingsModule } from './settings/settings.module.js';

/** Root module: infrastructure (config, logging, Prisma, Redis, flags, settings, queues, rate limits) plus the domain modules. */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule,
    FlagsModule,
    SettingsModule,
    QueueModule,
    RateLimitModule,
    HealthModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
