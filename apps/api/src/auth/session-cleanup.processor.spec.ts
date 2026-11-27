import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUEUE_NAMES } from '../queue/queue.constants.js';
import {
  AUTH_JOBS,
  CLEANUP_EVERY_MS,
  CLEANUP_SCHEDULER_ID,
  SessionCleanupProcessor,
  SessionCleanupScheduler,
} from './session-cleanup.processor.js';
import type { SessionCleanupService } from './session-cleanup.service.js';

class FakeWorker extends EventEmitter {
  name = QUEUE_NAMES.auth;
  opts: { autorun?: boolean } = { autorun: false };
  run = vi.fn(() => new Promise<void>(() => undefined));
  close = vi.fn(() => Promise.resolve());
}

function processorWith(workersEnabled = true) {
  const deleteExpired = vi.fn(() => Promise.resolve({ sessions: 4, verifications: 1 }));
  const cleanup = { deleteExpired } as unknown as SessionCleanupService;
  const processor = new SessionCleanupProcessor(
    { WORKERS_ENABLED: workersEnabled } as never,
    cleanup,
  );
  const worker = new FakeWorker();
  Object.assign(processor, { _worker: worker });
  return { processor, worker, deleteExpired };
}

function jobNamed(name: string): Job {
  return { name } as unknown as Job;
}

describe('QUEUE_NAMES (task 2.7)', () => {
  it('has a separate auth queue next to system', () => {
    expect(QUEUE_NAMES).toEqual({ system: 'system', auth: 'auth' });
  });
});

describe('SessionCleanupProcessor (task 2.7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the cleanup for the cleanup-expired job and returns the counts', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { processor, deleteExpired } = processorWith();
    await expect(processor.process(jobNamed(AUTH_JOBS.cleanupExpired))).resolves.toEqual({
      sessions: 4,
      verifications: 1,
    });
    expect(deleteExpired).toHaveBeenCalledOnce();
  });

  it('logs only the counts', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { processor } = processorWith();
    await processor.process(jobNamed(AUTH_JOBS.cleanupExpired));
    expect(log).toHaveBeenCalledWith('Removed 4 expired sessions and 1 verification values');
  });

  it('fails unknown job names without cleaning up', async () => {
    const { processor, deleteExpired } = processorWith();
    await expect(processor.process(jobNamed('delete-all-users'))).rejects.toThrow(
      'Unknown auth job: delete-all-users',
    );
    expect(deleteExpired).not.toHaveBeenCalled();
  });

  it('lets a cleanup failure fail the job', async () => {
    const { processor, deleteExpired } = processorWith();
    deleteExpired.mockRejectedValueOnce(new Error('P1001'));
    await expect(processor.process(jobNamed(AUTH_JOBS.cleanupExpired))).rejects.toThrow('P1001');
  });

  it('is switched by WORKERS_ENABLED like every processor', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const on = processorWith(true);
    await on.processor.onApplicationBootstrap();
    expect(on.worker.run).toHaveBeenCalledOnce();
    const off = processorWith(false);
    await off.processor.onApplicationBootstrap();
    expect(off.worker.run).not.toHaveBeenCalled();
    expect(off.worker.close).toHaveBeenCalledOnce();
  });
});

describe('SessionCleanupScheduler (task 2.7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function schedulerWith(upsert: () => Promise<unknown>) {
    const upsertJobScheduler = vi.fn(upsert);
    const scheduler = new SessionCleanupScheduler({ upsertJobScheduler } as unknown as Queue);
    return { scheduler, upsertJobScheduler };
  }

  it('upserts one hourly schedule with a fixed id at startup', () => {
    const { scheduler, upsertJobScheduler } = schedulerWith(() => Promise.resolve({}));
    scheduler.onApplicationBootstrap();
    expect(CLEANUP_SCHEDULER_ID).toBe('auth-cleanup-expired');
    expect(CLEANUP_EVERY_MS).toBe(60 * 60 * 1000);
    expect(upsertJobScheduler).toHaveBeenCalledOnce();
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'auth-cleanup-expired',
      { every: 60 * 60 * 1000 },
      { name: 'cleanup-expired', data: {} },
    );
  });

  it('returns at once, without waiting for Redis, even when the upsert never settles', () => {
    const { scheduler, upsertJobScheduler } = schedulerWith(() => new Promise(() => undefined));
    expect(scheduler.onApplicationBootstrap.bind(scheduler)).not.toThrow();
    expect(upsertJobScheduler).toHaveBeenCalledOnce();
  });

  it('does not throw when the upsert rejects', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { scheduler } = schedulerWith(() => Promise.reject(new Error('down')));
    expect(scheduler.onApplicationBootstrap.bind(scheduler)).not.toThrow();
  });

  it('survives a Redis error in the background and logs only its code', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { scheduler } = schedulerWith(() =>
      Promise.reject(
        Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379 password=hunter2'), {
          code: 'ECONNREFUSED',
        }),
      ),
    );
    scheduler.onApplicationBootstrap();
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('Could not schedule the cleanup (ECONNREFUSED)');
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('10.0.0.5');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('hunter2');
  });

  it('logs the error class when the error has no code', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { scheduler } = schedulerWith(() => Promise.reject(new Error('x')));
    scheduler.onApplicationBootstrap();
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('Could not schedule the cleanup (Error)');
    });
  });

  it('logs unknown for a non-Error rejection', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { scheduler } = schedulerWith(() => Promise.reject(Object.create(null) as Error));
    scheduler.onApplicationBootstrap();
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('Could not schedule the cleanup (unknown)');
    });
  });
});
