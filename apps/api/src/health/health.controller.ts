import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { type HealthReport, HealthService } from './health.service.js';

/**
 * Liveness and readiness for uptime monitoring (task 1.7; 11.9). Public (task 2.8): the uptime
 * monitor has no session. Reports only up/down per dependency, never error details.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOkResponse({ description: '{ status: "ok", database: "up", redis: "up" }' })
  @ApiServiceUnavailableResponse({
    description: 'status "error"; database/redis each "up" or "down"',
  })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    res.setHeader('Cache-Control', 'no-store');
    return report;
  }
}
