import './load-env.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './env.js';

const env = loadEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // SIGTERM/SIGINT close the HTTP server, then run onApplicationShutdown hooks (closing the database pool).
  app.enableShutdownHooks();
  await app.listen(env.PORT, env.HOST);
}
await bootstrap();
