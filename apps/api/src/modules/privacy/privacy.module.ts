import { Module } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';

// DSAR / privacy rights (blueprint §11 / P0): subject-access export + erasure.
@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
