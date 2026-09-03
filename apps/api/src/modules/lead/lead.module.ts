import { Module } from '@nestjs/common';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';

// Lead management (blueprint §7/§10): consent, dedupe, score, ownership, lifecycle.
@Module({
  controllers: [LeadController],
  providers: [LeadService],
  exports: [LeadService],
})
export class LeadModule {}
