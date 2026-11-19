import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module.js';
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

  it('probes the database with SELECT 1 after connecting', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const prisma = moduleRef.get(PrismaService);
    const calls: string[] = [];
    vi.spyOn(prisma, '$connect').mockImplementation(() => {
      calls.push('connect');
      return Promise.resolve();
    });
    const probe = vi.spyOn(prisma, '$queryRaw').mockImplementation(() => {
      calls.push('probe');
      return Promise.resolve([]) as ReturnType<typeof prisma.$queryRaw>;
    });

    await prisma.onModuleInit();

    expect(calls).toEqual(['connect', 'probe']);
    const [strings] = probe.mock.calls[0] ?? [];
    expect(Array.from(strings as TemplateStringsArray).join('?')).toBe('SELECT 1');
  });

  it('fails startup when the database cannot be reached', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const prisma = moduleRef.get(PrismaService);
    vi.spyOn(prisma, '$connect').mockResolvedValue();
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connection refused'));

    await expect(moduleRef.init()).rejects.toThrow('connection refused');
  });

  it('fails startup without probing when $connect itself fails', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const prisma = moduleRef.get(PrismaService);
    vi.spyOn(prisma, '$connect').mockRejectedValue(new Error('adapter failure'));
    const probe = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([]);

    await expect(moduleRef.init()).rejects.toThrow('adapter failure');
    expect(probe).not.toHaveBeenCalled();
  });

  it('closes the pool via onApplicationShutdown and surfaces disconnect errors', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const prisma = moduleRef.get(PrismaService);
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValueOnce();

    await prisma.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalledOnce();

    disconnect.mockRejectedValueOnce(new Error('pool already closed'));
    await expect(prisma.onApplicationShutdown()).rejects.toThrow('pool already closed');
  });

  it('refuses to start without a valid DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '');

    expect(() => new PrismaService()).toThrow(/DATABASE_URL/);
  });

  it('refuses a non-postgres DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'mysql://user:pass@localhost:3306/guesshive');

    expect(() => new PrismaService()).toThrow(/DATABASE_URL/);
  });

  it('does not leak DATABASE_URL credentials in the startup error', () => {
    vi.stubEnv('DATABASE_URL', 'mysql://admin:s3cr3t-pw@db.internal/guesshive');

    expect(() => new PrismaService()).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('s3cr3t-pw') as unknown }),
    );
  });
});

describe('PrismaModule wiring', () => {
  @Injectable()
  class ConsumerService {
    constructor(readonly prisma: PrismaService) {}
  }

  @Injectable()
  class OtherConsumerService {
    constructor(readonly prisma: PrismaService) {}
  }

  // Deliberately does NOT import PrismaModule: the module is @Global().
  @Module({ providers: [ConsumerService, OtherConsumerService] })
  class FeatureModule {}

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('makes one shared PrismaService injectable in modules that do not import it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, FeatureModule],
    }).compile();

    const prisma = moduleRef.get(PrismaService);
    const consumer = moduleRef.get(ConsumerService);
    const other = moduleRef.get(OtherConsumerService);

    expect(consumer.prisma).toBe(prisma);
    expect(other.prisma).toBe(prisma);
  });

  it('is registered in AppModule', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    const prisma = moduleRef.get(PrismaService);
    expect(typeof prisma.$queryRaw).toBe('function');
    expect(typeof prisma.onModuleInit).toBe('function');
  });
});
