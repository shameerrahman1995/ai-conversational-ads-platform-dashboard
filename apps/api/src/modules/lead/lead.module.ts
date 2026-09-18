import { Module } from '@nestjs/common';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';

// Lead management (blueprint §7/§10): consent, dedupe, score, ownership, lifecycle.
// Imports WebhooksModule so lead capture/qualification can fire outbound webhook
// events (best-effort) via the exported WebhookDeliveryService.
@Module({
  imports: [WebhooksModule],
  controllers: [LeadController],
  providers: [LeadService],
  exports: [LeadService],
})
export class LeadModule {}
