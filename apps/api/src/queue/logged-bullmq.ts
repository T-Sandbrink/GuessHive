import { type DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { type Processor, Queue, type QueueOptions, Worker, type WorkerOptions } from 'bullmq';
import { redisErrorCode, throttled } from '../redis/redis-errors.js';
import type { QueueName } from './queue.constants.js';

/**
 * Queue and Worker subclasses that listen for `error` from the moment they exist. BullMQ
 * connects in the constructor, so a listener added later (in a lifecycle hook) can miss an
 * early connection error, which BullMQ then prints in full (host included) with console.error.
 * Only the error code is logged, at most once a minute. @nestjs/bullmq creates every queue and
 * worker from these classes (set below, when this file is first imported).
 */
export class LoggedQueue extends Queue {
  constructor(name: string, opts: QueueOptions) {
    super(name, opts);
    const logger = new Logger('Queue');
    const warn = throttled((message) => {
      logger.warn(message);
    });
    this.on('error', (error: Error) => {
      warn(`Queue ${this.name} connection error (${redisErrorCode(error)})`);
    });
  }
}

export class LoggedWorker extends Worker {
  constructor(
    name: string,
    processor: string | URL | null | Processor | undefined,
    opts: WorkerOptions,
  ) {
    super(name, processor, opts);
    const logger = new Logger('Worker');
    const warn = throttled((message) => {
      logger.warn(message);
    });
    this.on('error', (error: Error) => {
      warn(`Worker ${this.name} error (${redisErrorCode(error)})`);
    });
    // Job errors can contain job data: log the job name and the error class or code only.
    this.on('failed', (job, error) => {
      logger.warn(
        `Job ${this.name}/${job?.name ?? 'unknown'} failed (attempt ${String(job?.attemptsMade ?? 0)}, ${redisErrorCode(error)})`,
      );
    });
  }
}

// @nestjs/bullmq reads these when `registerQueue` runs (queues) and at startup (workers).
BullModule.queueClass = LoggedQueue;
BullModule.workerClass = LoggedWorker;

/**
 * Registers a queue (use in a module's `imports`). Always use this instead of
 * `BullModule.registerQueue`: importing it guarantees the logged classes are set first.
 */
export function registerQueue(name: QueueName): DynamicModule {
  return BullModule.registerQueue({ name });
}
