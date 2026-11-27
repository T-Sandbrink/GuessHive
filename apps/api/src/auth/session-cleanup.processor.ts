import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, Processor } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { QUEUE_NAMES } from '../queue/queue.constants.js';
import { SwitchableWorkerHost } from '../queue/switchable-worker-host.js';
import { redisErrorCode } from '../redis/redis-errors.js';
import { type CleanupResult, SessionCleanupService } from './session-cleanup.service.js';

/** Job names on the `auth` queue. */
export const AUTH_JOBS = { cleanupExpired: 'cleanup-expired' } as const;

/** Id of the repeating cleanup schedule; upserting it again changes nothing. */
export const CLEANUP_SCHEDULER_ID = 'auth-cleanup-expired';

/** How often expired sessions and verification values are removed. */
export const CLEANUP_EVERY_MS = 60 * 60 * 1000;

/** Works the `auth` queue (task 2.7). */
@Processor(QUEUE_NAMES.auth, { autorun: false })
export class SessionCleanupProcessor extends SwitchableWorkerHost {
  private readonly logger = new Logger('SessionCleanup');

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    private readonly cleanup: SessionCleanupService,
  ) {
    super(env);
  }

  async process(job: Job): Promise<CleanupResult> {
    if (job.name === AUTH_JOBS.cleanupExpired) {
      const result = await this.cleanup.deleteExpired();
      this.logger.log(
        `Removed ${String(result.sessions)} expired sessions and ${String(result.verifications)} verification values`,
      );
      return result;
    }
    // Unknown names fail (and are removed after 7 days) instead of silently succeeding.
    throw new Error(`Unknown auth job: ${job.name}`);
  }
}

/**
 * Registers the hourly cleanup at startup. Every api process may do this (an upsert of the same
 * schedule); only processes with WORKERS_ENABLED run it. If Redis is down at startup the api still
 * starts (the registration waits for Redis in the background), and a failed registration is
 * retried at the next start.
 */
@Injectable()
export class SessionCleanupScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger('SessionCleanup');

  constructor(@InjectQueue(QUEUE_NAMES.auth) private readonly queue: Queue) {}

  onApplicationBootstrap(): void {
    // Not awaited: BullMQ waits for Redis to be ready, and a Redis outage must never keep the api
    // from starting (security review 2.7).
    this.queue
      .upsertJobScheduler(
        CLEANUP_SCHEDULER_ID,
        { every: CLEANUP_EVERY_MS },
        { name: AUTH_JOBS.cleanupExpired, data: {} },
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not schedule the cleanup (${error instanceof Error ? redisErrorCode(error) : 'unknown'})`,
        );
      });
  }
}
