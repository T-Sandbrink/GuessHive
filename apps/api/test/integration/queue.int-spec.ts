import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { type Queue, QueueEvents } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, QUEUE_PREFIX } from '../../src/queue/queue.constants.js';
import { SystemQueueService } from '../../src/queue/system-queue.service.js';
import { testRedisUrl } from './test-db-url.js';

const JOB_TIMEOUT_MS = 10_000;

async function startApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/** Empties the system queue in the test Redis (db 15, guarded by testRedisUrl). */
async function emptySystemQueue(app: INestApplication): Promise<void> {
  const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.system));
  await queue.obliterate({ force: true });
}

// The whole api against the docker compose Redis (db 15): BullMQ queue plus worker (task 1.8).
describe('BullMQ base against real Redis (task 1.8)', () => {
  describe('with workers enabled', () => {
    let app: INestApplication;
    let events: QueueEvents;

    beforeAll(async () => {
      vi.stubEnv('WORKERS_ENABLED', 'true');
      app = await startApp();
      await emptySystemQueue(app);
      events = new QueueEvents(QUEUE_NAMES.system, {
        connection: { url: testRedisUrl() },
        prefix: QUEUE_PREFIX,
      });
      await events.waitUntilReady();
    });

    afterAll(async () => {
      await events.close();
      await emptySystemQueue(app);
      await app.close();
      vi.unstubAllEnvs();
    });

    it('processes the ping job end to end', async () => {
      const job = await app.get(SystemQueueService).ping();
      await expect(job.waitUntilFinished(events, JOB_TIMEOUT_MS)).resolves.toEqual({ pong: true });
    });

    it('adds jobs with the retention from the owner decision', async () => {
      const job = await app.get(SystemQueueService).ping();
      expect(job.opts.removeOnComplete).toEqual(DEFAULT_JOB_OPTIONS.removeOnComplete);
      expect(job.opts.removeOnFail).toEqual(DEFAULT_JOB_OPTIONS.removeOnFail);
      await job.waitUntilFinished(events, JOB_TIMEOUT_MS);
    });

    it('fails a job with an unknown name instead of completing it', async () => {
      const queue = app.get<Queue>(getQueueToken(QUEUE_NAMES.system));
      const job = await queue.add('no-such-job', {});
      await expect(job.waitUntilFinished(events, JOB_TIMEOUT_MS)).rejects.toThrow(
        /Unknown system job/,
      );
    });
  });

  describe('with workers disabled', () => {
    let app: INestApplication | undefined;

    afterEach(async () => {
      if (app) {
        await emptySystemQueue(app);
        await app.close();
        app = undefined;
      }
      vi.unstubAllEnvs();
    });

    it('still accepts jobs but leaves them waiting', async () => {
      vi.stubEnv('WORKERS_ENABLED', 'false');
      app = await startApp();
      const job = await app.get(SystemQueueService).ping();
      // Give a (wrongly) running worker time to pick the job up.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await expect(job.getState()).resolves.toBe('waiting');
    });
  });
});
