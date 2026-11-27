import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SessionCleanupService } from './session-cleanup.service.js';

const NOW = new Date('2026-11-28T12:00:00.000Z');

function fakePrisma(sessions = 3, verifications = 2) {
  const sessionDelete = vi.fn((args: unknown) => ({ op: 'session', args }));
  const verificationDelete = vi.fn((args: unknown) => ({ op: 'verification', args }));
  const transaction = vi.fn((ops: unknown[]) => {
    expect(ops).toHaveLength(2);
    return Promise.resolve([{ count: sessions }, { count: verifications }]);
  });
  const prisma = {
    session: { deleteMany: sessionDelete },
    verification: { deleteMany: verificationDelete },
    $transaction: transaction,
  } as unknown as PrismaService;
  return { prisma, sessionDelete, verificationDelete, transaction };
}

describe('SessionCleanupService (task 2.7)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes rows that expired strictly before now, both tables in one transaction', async () => {
    const { prisma, sessionDelete, verificationDelete, transaction } = fakePrisma();
    await new SessionCleanupService(prisma).deleteExpired(NOW);
    expect(sessionDelete).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
    expect(verificationDelete).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith([
      { op: 'session', args: { where: { expiresAt: { lt: NOW } } } },
      { op: 'verification', args: { where: { expiresAt: { lt: NOW } } } },
    ]);
  });

  it('returns the counts per table', async () => {
    const { prisma } = fakePrisma(7, 0);
    await expect(new SessionCleanupService(prisma).deleteExpired(NOW)).resolves.toEqual({
      sessions: 7,
      verifications: 0,
    });
  });

  it('defaults to the current time', async () => {
    vi.useFakeTimers({ now: NOW });
    const { prisma, sessionDelete } = fakePrisma();
    await new SessionCleanupService(prisma).deleteExpired();
    expect(sessionDelete).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
  });

  it('passes a database error on, so the job fails', async () => {
    const { prisma, transaction } = fakePrisma();
    transaction.mockRejectedValueOnce(new Error('P1001'));
    await expect(new SessionCleanupService(prisma).deleteExpired(NOW)).rejects.toThrow('P1001');
  });
});
