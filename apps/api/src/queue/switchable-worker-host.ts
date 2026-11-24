import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import type { ApiEnv } from '../env.js';
import { redisErrorCode, throttled } from './redis-error-code.js';

/**
 * Base class for every BullMQ processor in the api. Decorate subclasses with
 * `@Processor(name, { autorun: false })`: the worker then starts here, only when
 * `WORKERS_ENABLED` is on (owner decision 2026-11-24). When it is off, the worker is closed at
 * startup, so this process only adds jobs and another process can run the workers later.
 */
export abstract class SwitchableWorkerHost extends WorkerHost implements OnApplicationBootstrap {
  private readonly hostLogger = new Logger(this.constructor.name);

  protected constructor(private readonly workersEnv: Pick<ApiEnv, 'WORKERS_ENABLED'>) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const worker = this.worker;
    // Without a listener an `error` event would be unhandled. Log the code only: messages can
    // contain the Redis host, and job errors can contain job data.
    const warn = throttled((message) => {
      this.hostLogger.warn(message);
    });
    worker.on('error', (error: Error) => {
      warn(`Worker error (${redisErrorCode(error)})`);
    });
    worker.on('failed', (job, error) => {
      this.hostLogger.warn(
        `Job ${job?.name ?? 'unknown'} failed (attempt ${String(job?.attemptsMade ?? 0)}, ${redisErrorCode(error)})`,
      );
    });

    if (!this.workersEnv.WORKERS_ENABLED) {
      await worker.close();
      return;
    }
    // `run()` only settles when the worker closes, so it is not awaited here.
    worker.run().catch((error: unknown) => {
      this.hostLogger.error(
        `Worker stopped (${error instanceof Error ? redisErrorCode(error) : 'unknown'})`,
      );
    });
  }
}
