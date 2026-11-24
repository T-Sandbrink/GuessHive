import './load-env.js';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { API_ENV } from './config/config.module.js';
import type { ApiEnv } from './env.js';
import { setupOpenApi } from './openapi.js';

async function bootstrap() {
  // Buffer startup logs until the pino logger is in place. Nest types this options bag as a
  // class, which the rule mistakes for an instance that a literal could fake.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // SIGTERM/SIGINT close the HTTP server, then the BullMQ workers (after their running jobs
  // finish), then the onApplicationShutdown hooks: queues, Redis and the database pool.
  app.enableShutdownHooks();
  const env = app.get<ApiEnv>(API_ENV);
  // OpenAPI + Swagger UI on /docs, development only (task 1.6).
  setupOpenApi(app, process.env['NODE_ENV']);
  await app.listen(env.PORT, env.HOST);
}
await bootstrap();
