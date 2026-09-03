import { Module } from '@nestjs/common';
import { PublishService } from './publish.service';
import { PublishingController } from './publishing.controller';
import { ConnectorRegistry } from './connector-registry';
import { GenericExportConnector, GoogleAdsConnector, MetaConnector } from './connectors/adapters';

// Publishing (blueprint §8/§14): connector framework + publish control plane.
@Module({
  controllers: [PublishingController],
  providers: [
    PublishService,
    ConnectorRegistry,
    GoogleAdsConnector,
    MetaConnector,
    GenericExportConnector,
  ],
})
export class PublishingModule {}
