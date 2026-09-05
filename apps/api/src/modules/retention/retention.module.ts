import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { RetentionController } from './retention.controller';

// Data retention (blueprint §11 / P1): message-transcript redaction + expired
// knowledge-chunk deletion. Exposed on demand; a cron should call the service.
@Module({
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
