import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaModule } from './prisma.module.js';
import { PrismaService } from './prisma.service.js';

// Prisma 7's client constructor returns a proxy, so `instanceof PrismaService`
// is false by design; these tests check behaviour instead of identity.
describe('PrismaService', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('connects when the Nest app starts and disconnects when it closes', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const prisma = moduleRef.get(PrismaService);
    const connect = vi.spyOn(prisma, '$connect').mockResolvedValue();
    const probe = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([]);
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue();

    await moduleRef.init();
    expect(connect).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();

    await moduleRef.close();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('fails startup when the database cannot be reached', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const prisma = moduleRef.get(PrismaService);
    vi.spyOn(prisma, '$connect').mockResolvedValue();
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connection refused'));

    await expect(moduleRef.init()).rejects.toThrow('connection refused');
  });

  it('refuses to start without a valid DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '');

    expect(() => new PrismaService()).toThrow(/DATABASE_URL/);
  });
});
