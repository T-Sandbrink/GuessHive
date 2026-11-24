import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { redisErrorCode, throttled } from './redis-error-code.js';
import { SYSTEM_JOBS, SystemProcessor } from './system.processor.js';

class FakeWorker extends EventEmitter {
  run = vi.fn(() => new Promise<void>(() => undefined));
  close = vi.fn(() => Promise.resolve());
}

function processorWith(workersEnabled: boolean): {
  processor: SystemProcessor;
  worker: FakeWorker;
} {
  const processor = new SystemProcessor({ WORKERS_ENABLED: workersEnabled } as never);
  const worker = new FakeWorker();
  Object.assign(processor, { _worker: worker });
  return { processor, worker };
}

function jobNamed(name: string): Job {
  return { name } as unknown as Job;
}

describe('redisErrorCode', () => {
  it('returns the error code, never the message', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379 pw=hunter2'), {
      code: 'ECONNREFUSED',
    });
    expect(redisErrorCode(error)).toBe('ECONNREFUSED');
  });

  it('falls back to the error class name', () => {
    expect(redisErrorCode(new TypeError('job data: jan@example.com'))).toBe('TypeError');
  });
});

describe('throttled', () => {
  it('logs at most once per interval', () => {
    let now = 0;
    const log = vi.fn();
    const warn = throttled(log, 1_000, () => now);
    warn('a');
    now = 999;
    warn('b');
    now = 1_000;
    warn('c');
    expect(log.mock.calls).toEqual([['a'], ['c']]);
  });
});

describe('SystemProcessor (task 1.8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers the ping job', async () => {
    const { processor } = processorWith(true);
    await expect(processor.process(jobNamed(SYSTEM_JOBS.ping))).resolves.toEqual({ pong: true });
  });

  it('fails unknown job names', async () => {
    const { processor } = processorWith(true);
    await expect(processor.process(jobNamed('drop-tables'))).rejects.toThrow(
      'Unknown system job: drop-tables',
    );
  });

  it('starts the worker when WORKERS_ENABLED is on', async () => {
    const { processor, worker } = processorWith(true);
    await processor.onApplicationBootstrap();
    expect(worker.run).toHaveBeenCalledOnce();
    expect(worker.close).not.toHaveBeenCalled();
  });

  it('closes the worker without running it when WORKERS_ENABLED is off', async () => {
    const { processor, worker } = processorWith(false);
    await processor.onApplicationBootstrap();
    expect(worker.run).not.toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalledOnce();
  });

  it('handles worker errors and logs only the code, throttled', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { processor, worker } = processorWith(true);
    await processor.onApplicationBootstrap();
    const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379'), {
      code: 'ECONNREFUSED',
    });
    expect(() => worker.emit('error', error)).not.toThrow();
    worker.emit('error', error);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Worker error (ECONNREFUSED)');
  });

  it('logs a failed job by name and error class only', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { processor, worker } = processorWith(true);
    await processor.onApplicationBootstrap();
    worker.emit(
      'failed',
      { name: 'ping', attemptsMade: 1 },
      new Error('user jan@example.com not found'),
    );
    expect(warn).toHaveBeenCalledWith('Job ping failed (attempt 1, Error)');
  });

  it('logs when the running worker stops with an error', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { processor, worker } = processorWith(true);
    worker.run.mockReturnValueOnce(
      Promise.reject(Object.assign(new Error('host 10.0.0.5'), { code: 'NOAUTH' })),
    );
    await processor.onApplicationBootstrap();
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith('Worker stopped (NOAUTH)');
    });
  });
});
