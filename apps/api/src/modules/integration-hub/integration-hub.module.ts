import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { FeedbackService } from './feedback.service';
import { CrmRegistry } from './crm-registry';
import { WebhookCrmAdapter, HubspotCrmAdapter, ZohoCrmAdapter } from './crm-adapters';
import { IntegrationHubController } from './integration-hub.controller';

// Integration hub (blueprint §15): CRM adapters, field mapping, delivery, replay,
// and CRM stage/revenue feedback.
@Module({
  controllers: [IntegrationHubController],
  providers: [
    DeliveryService,
    FeedbackService,
    CrmRegistry,
    WebhookCrmAdapter,
    HubspotCrmAdapter,
    ZohoCrmAdapter,
  ],
})
export class IntegrationHubModule {}
