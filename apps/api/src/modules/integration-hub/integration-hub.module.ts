import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CrmRegistry } from './crm-registry';
import { WebhookCrmAdapter, HubspotCrmAdapter, ZohoCrmAdapter } from './crm-adapters';
import { IntegrationHubController } from './integration-hub.controller';

// Integration hub (blueprint §15): CRM adapters, field mapping, delivery, replay.
@Module({
  controllers: [IntegrationHubController],
  providers: [DeliveryService, CrmRegistry, WebhookCrmAdapter, HubspotCrmAdapter, ZohoCrmAdapter],
})
export class IntegrationHubModule {}
