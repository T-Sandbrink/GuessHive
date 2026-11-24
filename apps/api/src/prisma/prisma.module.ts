import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Infrastructure module: imported once in AppModule, PrismaService is injectable everywhere. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
