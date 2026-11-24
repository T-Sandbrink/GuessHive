import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';

/** App settings (task 1.12): SettingsService is injectable in every domain module. */
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
