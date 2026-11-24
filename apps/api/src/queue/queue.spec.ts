import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_JOBS, SystemProcessor } from './system.processor.js';

class FakeWorker extends EventEmitter {
  name = 'system';
  opts: { autorun?: boolean } = { autorun: false };
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
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { processor, worker } = processorWith(false);
    await processor.onApplicationBootstrap();
    expect(worker.run).not.toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalledOnce();
  });

  it('logs one line when workers are disabled', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { processor } = processorWith(false);
    await processor.onApplicationBootstrap();
    expect(log).toHaveBeenCalledWith('Worker for queue system disabled (WORKERS_ENABLED=false)');
  });

  it('refuses a processor without autorun: false', async () => {
    const { processor, worker } = processorWith(true);
    worker.opts = {};
    await expect(processor.onApplicationBootstrap()).rejects.toThrow(/autorun: false/);
    expect(worker.run).not.toHaveBeenCalled();
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
