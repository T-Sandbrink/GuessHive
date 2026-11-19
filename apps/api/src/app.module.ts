import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';

/** Root module. Domain modules (health, auth, questions, …) are added from phase 1 on. */
@Module({
  imports: [PrismaModule],
})
export class AppModule {}
