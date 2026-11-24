import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service.js';

/** Feature flags (task 1.11): FeatureFlagsService is injectable in every domain module. */
@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FlagsModule {}
