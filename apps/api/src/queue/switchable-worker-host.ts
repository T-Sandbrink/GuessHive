import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import type { ApiEnv } from '../env.js';
import { redisErrorCode } from '../redis/redis-errors.js';

/**
 * Base class for every BullMQ processor in the api. Decorate subclasses with
 * `@Processor(name, { autorun: false })` (checked at startup): the worker then starts here,
 * only when `WORKERS_ENABLED` is on (owner decision 2026-11-24). When it is off, the worker is
 * closed at startup, so this process only adds jobs and another process can run the workers.
 *
 * Job data and job errors are stored in Redis (failed jobs for 7 days): put ids in job data,
 * never emails, IPs or other personal data, and throw errors with codes or ids only.
 */
export abstract class SwitchableWorkerHost extends WorkerHost implements OnApplicationBootstrap {
  private readonly hostLogger = new Logger(this.constructor.name);

  protected constructor(private readonly workersEnv: Pick<ApiEnv, 'WORKERS_ENABLED'>) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const worker = this.worker;
    if (worker.opts.autorun !== false) {
      throw new Error(
        `${this.constructor.name}: use @Processor(name, { autorun: false }) so WORKERS_ENABLED can switch it off`,
      );
    }
    if (!this.workersEnv.WORKERS_ENABLED) {
      this.hostLogger.log(`Worker for queue ${worker.name} disabled (WORKERS_ENABLED=false)`);
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
