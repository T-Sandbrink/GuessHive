import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';

/** How long to wait for a new Redis connection before the attempt fails. */
export const REDIS_CONNECT_TIMEOUT_MS = 5_000;

/**
 * The api's shared Redis connection (ioredis, owner decision 2026-11-19). It connects lazily on
 * the first command, so the api still starts while Redis is down and `/health` reports it.
 * BullMQ (task 1.8) creates its own connections from the same URL.
 */
@Injectable()
export class RedisService extends Redis implements OnApplicationShutdown {
  constructor(@Inject(API_ENV) env: ApiEnv) {
    super(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      // Fail a command after one reconnect attempt instead of queueing it for ever.
      maxRetriesPerRequest: 1,
    });
    // Without a listener ioredis prints every failed reconnect as an unhandled error. Log only
    // the error code: the message can contain the host, and the URL can contain a password.
    // Logged once per outage (ioredis retries every few seconds), and again on recovery.
    const logger = new Logger(RedisService.name);
    let failing = false;
    this.on('error', (error: Error) => {
      if (!failing) {
        failing = true;
        const code = 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
        logger.warn(`Redis connection error (${code})`);
      }
    });
    this.on('ready', () => {
      if (failing) {
        failing = false;
        logger.log('Redis connection restored');
      }
    });
  }

  /** Closes the connection on shutdown; `disconnect` is safe when it never connected. */
  onApplicationShutdown(): void {
    this.disconnect();
  }
}
