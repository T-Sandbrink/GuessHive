import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** How many expired rows were removed in one run. */
export interface CleanupResult {
  sessions: number;
  verifications: number;
}

/**
 * Removes expired `Session` and `Verification` rows (task 2.7; retention in the processing
 * register, row 6): they are useless once expired, so they go within about an hour. Filters only
 * on the indexed `expiresAt`, never on id order.
 */
@Injectable()
export class SessionCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteExpired(now: Date = new Date()): Promise<CleanupResult> {
    const expired = { expiresAt: { lt: now } };
    const [sessions, verifications] = await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: expired }),
      this.prisma.verification.deleteMany({ where: expired }),
    ]);
    return { sessions: sessions.count, verifications: verifications.count };
  }
}
