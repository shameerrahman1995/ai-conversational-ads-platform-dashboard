import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhooksController } from './webhooks.controller';

// Developer platform: outbound webhooks — org-scoped, admin-only, HMAC-signed,
// SSRF-guarded test delivery, plus durable event dispatch with idempotent,
// exponentially-backed-off retries (blueprint U7.1). WebhookDeliveryService is
// exported so domain modules (e.g. LeadModule) can fire events best-effort.
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryService],
  exports: [WebhookDeliveryService],
})
export class WebhooksModule {}
