import { Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggedQueue, LoggedWorker, registerQueue } from './logged-bullmq.js';

// Nothing listens on port 1, so every connection attempt fails right away.
const connection = { host: '127.0.0.1', port: 1 };

function codeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('LoggedQueue / LoggedWorker (task 1.8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a queue listens for errors from construction on and logs only the code, throttled', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const queue = new LoggedQueue('unit', { connection });
    expect(queue.listenerCount('error')).toBeGreaterThan(0);
    const error = codeError('connect ECONNREFUSED 10.0.0.5:6379 pw=hunter2', 'ECONNREFUSED');
    queue.emit('error', error);
    queue.emit('error', error);
    expect(
      warn.mock.calls.filter(([m]) => m === 'Queue unit connection error (ECONNREFUSED)'),
    ).toHaveLength(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/hunter2|10\.0\.0\.5/);
    await queue.close();
  });

  it('a worker logs errors and failed jobs without messages or job data', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const worker = new LoggedWorker('unit', null, { connection, autorun: false });
    expect(worker.listenerCount('error')).toBeGreaterThan(0);
    worker.emit('error', codeError('NOAUTH host 10.0.0.5', 'NOAUTH'));
    worker.emit(
      'failed',
      { name: 'ping', attemptsMade: 2 } as never,
      new Error('user jan@example.com not found'),
      'active',
    );
    expect(warn).toHaveBeenCalledWith('Worker unit error (NOAUTH)');
    expect(warn).toHaveBeenCalledWith('Job unit/ping failed (attempt 2, Error)');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/jan@example|10\.0\.0\.5/);
    await worker.close();
  });

  it('registerQueue makes @nestjs/bullmq build queues from LoggedQueue', () => {
    const dynamicModule = registerQueue('system');
    expect(dynamicModule.module).toBe(BullModule);
    expect((BullModule as unknown as { _queueClass: unknown })._queueClass).toBe(LoggedQueue);
    expect((BullModule as unknown as { _workerClass: unknown })._workerClass).toBe(LoggedWorker);
  });
});
