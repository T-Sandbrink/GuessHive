import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { type HealthReport, HealthService } from './health.service.js';

/**
 * Liveness and readiness for uptime monitoring (task 1.7; 11.9). Public by design once the global
 * auth guard exists. Reports only up/down per dependency, never error details.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    res.setHeader('Cache-Control', 'no-store');
    return report;
  }
}
