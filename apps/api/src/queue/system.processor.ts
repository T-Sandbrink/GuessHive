import { Inject } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { QUEUE_NAMES } from './queue.constants.js';
import { SwitchableWorkerHost } from './switchable-worker-host.js';

/** Job names on the `system` queue. */
export const SYSTEM_JOBS = { ping: 'ping' } as const;

export interface PingResult {
  pong: true;
}

/** Works the `system` queue. `ping` (task 1.8) has no side effects: it only proves the pipeline. */
@Processor(QUEUE_NAMES.system, { autorun: false })
export class SystemProcessor extends SwitchableWorkerHost {
  constructor(@Inject(API_ENV) env: ApiEnv) {
    super(env);
  }

  process(job: Job): Promise<PingResult> {
    if (job.name === SYSTEM_JOBS.ping) {
      return Promise.resolve({ pong: true });
    }
    // Unknown names fail (and are removed after 7 days) instead of silently succeeding.
    return Promise.reject(new Error(`Unknown system job: ${job.name}`));
  }
}
