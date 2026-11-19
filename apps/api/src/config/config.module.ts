import { Global, Module } from '@nestjs/common';
import { type ApiEnv, loadEnv } from '../env.js';

/** Injection token for the parsed, validated api environment (`@Inject(API_ENV) env: ApiEnv`). */
export const API_ENV = Symbol('API_ENV');

/**
 * Parses the environment once (zod, AGENTS.md §7) and makes it injectable everywhere.
 * Invalid config throws while the module graph is built, so the api never starts with it.
 */
@Global()
@Module({
  providers: [{ provide: API_ENV, useFactory: (): ApiEnv => loadEnv() }],
  exports: [API_ENV],
})
export class ConfigModule {}
