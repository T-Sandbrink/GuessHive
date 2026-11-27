import type { DefaultJobOptions } from 'bullmq';

/** Every BullMQ queue the api registers. Domain modules add theirs here. */
export const QUEUE_NAMES = {
  /** Infrastructure jobs (task 1.8): the `ping` job proves queue and worker work end to end. */
  system: 'system',
  /** Auth housekeeping (task 2.7): removes expired sessions and verification values. */
  auth: 'auth',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Prefix for every BullMQ key in Redis, so queue data is easy to find and never collides. */
export const QUEUE_PREFIX = 'gh:bull';

const HOUR_SECONDS = 60 * 60;

/**
 * Finished jobs are removed automatically (owner decision 2026-11-24): completed ones after
 * 24 hours (at most 1,000 kept per queue), failed ones after 7 days. Job data can hold ids, so
 * nothing is kept longer than needed for debugging.
 */
export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 24 * HOUR_SECONDS, count: 1_000 },
  removeOnFail: { age: 7 * 24 * HOUR_SECONDS },
} as const satisfies DefaultJobOptions;
