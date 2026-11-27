import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

/** Outgoing email (task 2.2). */
@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
