import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

/** Infrastructure module: imported once in AppModule, RedisService is injectable everywhere. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
