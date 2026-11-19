import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** How long to wait for a new database connection before failing. */
export const CONNECTION_TIMEOUT_MS = 5_000;
/** Connections per api process (pg's default, made explicit). */
export const POOL_MAX = 10;

/**
 * The single Prisma client of the api. Only services use it (AGENTS.md §3);
 * controllers never touch the database directly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(API_ENV) env: ApiEnv) {
    super({
      // Short error messages without the rendered query and its argument values.
      errorFormat: 'minimal',
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        // pg defaults to no connect timeout, so an unreachable host would hang the
        // startup probe forever instead of failing fast.
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        max: POOL_MAX,
      }),
    });
  }

  /**
   * Verifies the database at startup, so an unreachable database stops the api early.
   * With a driver adapter `$connect()` alone opens no connection, hence the probe query.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
  }

  /**
   * Closes the pool on shutdown (enableShutdownHooks in main.ts). This hook runs after
   * the HTTP server has closed, so in-flight requests can still use the database.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
