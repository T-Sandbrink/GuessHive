import { createHmac } from 'node:crypto';
import { normalizeIp } from '@nestjs/throttler';

/**
 * Keyed hash of a client IP (HMAC-SHA256, hex), so no raw IP address is ever stored (AGENTS.md
 * §9). IPv6 addresses are first reduced to their /64 network, since one client usually owns a
 * whole /64 and could otherwise dodge a limit by switching addresses.
 */
export function hashIp(secret: string, ip: string): string {
  return createHmac('sha256', secret).update(normalizeIp(ip)).digest('hex');
}
