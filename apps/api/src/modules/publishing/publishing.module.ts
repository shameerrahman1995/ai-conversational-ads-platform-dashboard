import { Module } from '@nestjs/common';
import { PublishService } from './publish.service';
import { PublishingController } from './publishing.controller';

// Publishing (blueprint §8/§14): publish control plane. The ad-connector registry
// is provided globally by AdConnectorsModule.
@Module({
  controllers: [PublishingController],
  providers: [PublishService],
})
export class PublishingModule {}
