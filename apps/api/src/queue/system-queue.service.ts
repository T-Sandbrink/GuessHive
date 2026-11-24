import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants.js';
import { SYSTEM_JOBS } from './system.processor.js';

/** Adds jobs to the `system` queue. */
@Injectable()
export class SystemQueueService {
  constructor(@InjectQueue(QUEUE_NAMES.system) private readonly queue: Queue) {}

  /** Enqueues a `ping` job, the dummy job that checks queue and worker end to end. */
  ping(): Promise<Job> {
    return this.queue.add(SYSTEM_JOBS.ping, {});
  }
}
