import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

/** Per-dependency budget, so a hanging dependency cannot hang the health check. */
export const HEALTH_CHECK_TIMEOUT_MS = 2_000;
/** How long a finished report is reused, so a flood of requests cannot drain the db pool. */
export const HEALTH_CACHE_MS = 2_000;

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'error';
  database: DependencyStatus;
  redis: DependencyStatus;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private inFlight: Promise<HealthReport> | undefined;
  private cached: { report: HealthReport; at: number } | undefined;

  /**
   * Concurrent callers share one probe run, and its result is reused for HEALTH_CACHE_MS, so
   * /health costs at most one `SELECT 1` and one `PING` per window however often it is called.
   */
  check(): Promise<HealthReport> {
    if (this.cached && Date.now() - this.cached.at < HEALTH_CACHE_MS) {
      return Promise.resolve(this.cached.report);
    }
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async run(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.redis.ping()),
    ]);
    const report: HealthReport = {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      database,
      redis,
    };
    this.cached = { report, at: Date.now() };
    return report;
  }
}

/** Runs one probe with a timeout. Errors are not logged here: they may contain connection details. */
async function probe(run: () => Promise<unknown>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('timeout'));
    }, HEALTH_CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([run(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
