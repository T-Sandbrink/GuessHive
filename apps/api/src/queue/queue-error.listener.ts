import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants.js';
import { redisErrorCode, throttled } from './redis-error-code.js';

/**
 * Listens for `error` on every registered queue, so the event is never unhandled, and logs the
 * error code only (never the message, which can hold the Redis host), at most once a minute.
 */
@Injectable()
export class QueueErrorListener implements OnModuleInit {
  private readonly logger = new Logger('Queue');

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    for (const name of Object.values(QUEUE_NAMES)) {
      const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
      const warn = throttled((message) => {
        this.logger.warn(message);
      });
      queue.on('error', (error: Error) => {
        warn(`Queue ${name} connection error (${redisErrorCode(error)})`);
      });
    }
  }
}
