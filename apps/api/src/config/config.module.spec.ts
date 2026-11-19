import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../env.js';
import { API_ENV, ConfigModule } from './config.module.js';

const DATABASE_URL = 'postgresql://user:pass@localhost:5440/guesshive';

describe('ConfigModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('provides the parsed environment under API_ENV', async () => {
    vi.stubEnv('DATABASE_URL', DATABASE_URL);
    vi.stubEnv('PORT', '4321');
    vi.stubEnv('LOG_LEVEL', 'warn');
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
    expect(moduleRef.get<ApiEnv>(API_ENV)).toMatchObject({
      DATABASE_URL,
      PORT: 4321,
      LOG_LEVEL: 'warn',
    });
    await moduleRef.close();
  });

  it('parses the environment once and shares the same object', async () => {
    vi.stubEnv('DATABASE_URL', DATABASE_URL);
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
    expect(moduleRef.get<ApiEnv>(API_ENV)).toBe(moduleRef.get<ApiEnv>(API_ENV));
    await moduleRef.close();
  });

  it('fails to build the module graph on an invalid environment', async () => {
    vi.stubEnv('DATABASE_URL', 'mysql://admin:s3cr3t@localhost/db');
    const compiling = Test.createTestingModule({ imports: [ConfigModule] }).compile();
    await expect(compiling).rejects.toThrow(/DATABASE_URL/);
  });

  it('fails on an unknown LOG_LEVEL', async () => {
    vi.stubEnv('DATABASE_URL', DATABASE_URL);
    vi.stubEnv('LOG_LEVEL', 'verbose');
    const compiling = Test.createTestingModule({ imports: [ConfigModule] }).compile();
    await expect(compiling).rejects.toThrow(/LOG_LEVEL/);
  });
});
