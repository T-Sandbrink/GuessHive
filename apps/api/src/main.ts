import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadDotEnvFile, loadEnv } from './env.js';

loadDotEnvFile();
const env = loadEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT);
}
await bootstrap();
