import './load-env.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './env.js';

const env = loadEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT, env.HOST);
}
await bootstrap();
