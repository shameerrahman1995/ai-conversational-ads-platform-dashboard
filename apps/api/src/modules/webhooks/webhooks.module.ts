import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

// Developer platform: outbound webhooks — org-scoped, admin-only, HMAC-signed,
// SSRF-guarded test delivery (blueprint U7.1).
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
