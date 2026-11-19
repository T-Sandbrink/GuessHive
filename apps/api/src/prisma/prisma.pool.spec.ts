import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as AdapterPg from '@prisma/adapter-pg';

const adapterOptions = vi.hoisted(() => [] as unknown[]);

vi.mock('@prisma/adapter-pg', async (importOriginal) => {
  const actual = await importOriginal<typeof AdapterPg>();
  class RecordingPrismaPg extends actual.PrismaPg {
    constructor(...args: ConstructorParameters<typeof actual.PrismaPg>) {
      super(...args);
      adapterOptions.push(args[0]);
    }
  }
  return { ...actual, PrismaPg: RecordingPrismaPg };
});

const { CONNECTION_TIMEOUT_MS, POOL_MAX, PrismaService } = await import('./prisma.service.js');

describe('PrismaService pool config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets a connect timeout and an explicit pool size', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
    new PrismaService();

    expect(CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(adapterOptions.at(-1)).toMatchObject({
      connectionString: 'postgresql://user:pass@localhost:5440/guesshive',
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      max: POOL_MAX,
    });
  });
});
