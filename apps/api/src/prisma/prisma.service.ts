import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The single Prisma client of the api. Only services use it (AGENTS.md §3);
 * controllers never touch the database directly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: loadEnv().DATABASE_URL }) });
  }

  /**
   * Verifies the database at startup, so an unreachable database stops the api early.
   * With a driver adapter `$connect()` alone opens no connection, hence the probe query.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
  }

  /** Runs on shutdown (enableShutdownHooks in main.ts) and closes the pool. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
