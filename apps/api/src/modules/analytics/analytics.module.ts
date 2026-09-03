import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SpendService } from './spend.service';
import { AnalyticsController } from './analytics.controller';

// Analytics (blueprint §13): append-only events + funnel + provider spend import.
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SpendService],
  exports: [AnalyticsService, SpendService],
})
export class AnalyticsModule {}
