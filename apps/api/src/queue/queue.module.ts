import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { REDIS_CONNECT_TIMEOUT_MS } from '../redis/redis.service.js';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, QUEUE_PREFIX } from './queue.constants.js';
import { QueueErrorListener } from './queue-error.listener.js';
import { SystemQueueService } from './system-queue.service.js';
import { SystemProcessor } from './system.processor.js';

/**
 * BullMQ base (task 1.8). Shared connection settings and job retention for every queue; the
 * `system` queue with its `ping` job. Domain modules register their own queues with
 * `BullModule.registerQueue` and processors extending `SwitchableWorkerHost`.
 * BullMQ opens its own Redis connections (workers need blocking ones), from the same REDIS_URL.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => ({
        connection: { url: env.REDIS_URL, connectTimeout: REDIS_CONNECT_TIMEOUT_MS },
        prefix: QUEUE_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.system }),
  ],
  providers: [QueueErrorListener, SystemProcessor, SystemQueueService],
  exports: [SystemQueueService],
})
export class QueueModule {}
