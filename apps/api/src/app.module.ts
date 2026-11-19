import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { createValidationPipe } from './common/validation.js';
import { ConfigModule } from './config/config.module.js';
import { LoggerModule } from './logging/logger.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/** Root module. Domain modules (health, auth, questions, …) are added from phase 1 on. */
@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
