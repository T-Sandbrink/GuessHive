import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  type CanActivate,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  type INestApplication,
  Injectable,
  NotFoundException,
  Param,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { ApiException } from '../src/common/api.exception.js';
import { REQUEST_ID_HEADER } from '../src/logging/logger.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Injectable()
class DenyGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException('user jan@example.com is not a member');
  }
}

@Injectable()
class FalseGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

@Injectable()
class UnauthenticatedGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException('missing session cookie abc123');
  }
}

@Controller('test-errors')
class ErrorsController {
  @Get('api')
  api(): never {
    throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'Already done');
  }

  @Get('http')
  http(): never {
    throw new NotFoundException('Question 42 of user jan@example.com not found');
  }

  @Get('crash/:secret')
  crash(@Param('secret') secret: string): never {
    throw new Error(`database password is ${secret}`);
  }

  @Get('guarded')
  @UseGuards(DenyGuard)
  guarded(): string {
    return 'unreachable';
  }

  @Get('guard-false')
  @UseGuards(FalseGuard)
  guardFalse(): string {
    return 'unreachable';
  }

  @Get('unauthenticated')
  @UseGuards(UnauthenticatedGuard)
  unauthenticated(): string {
    return 'unreachable';
  }
}

// HTTP tests without a database; real-database tests arrive in task 1.10.
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ErrorsController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = moduleFixture.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('answers unknown routes with 404 and a { code, message } body', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
  });

  it('sets a generated request id on every response', async () => {
    const res = await request(app.getHttpServer())
      .get('/nope')
      .set(REQUEST_ID_HEADER, 'attacker-chosen');
    const id = res.headers[REQUEST_ID_HEADER.toLowerCase()];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('passes ApiException codes and messages through', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/api').expect(409);
    expect(res.body).toEqual({ code: 'CONFLICT', message: 'Already done' });
  });

  it('replaces HttpException messages with a fixed message per code', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/http').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
  });

  it('answers a guard that throws ForbiddenException with 403 FORBIDDEN', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/guarded').expect(403);
    expect(res.body).toEqual({ code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it('answers a guard that returns false with 403 FORBIDDEN', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/guard-false').expect(403);
    expect(res.body).toEqual({ code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it('answers a guard that throws UnauthorizedException with 401 UNAUTHORIZED', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/unauthenticated').expect(401);
    expect(res.body).toEqual({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
  });

  it('answers a malformed JSON body with 400 BAD_REQUEST', async () => {
    const res = await request(app.getHttpServer())
      .post('/nope')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'BAD_REQUEST', message: 'Bad request' });
  });

  it('hides unexpected errors behind INTERNAL_ERROR', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/crash/hunter2').expect(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
