import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SpendService } from './spend.service';
import { AttributionService } from './attribution.service';
import { AnalyticsController } from './analytics.controller';

// Analytics (blueprint §13/§22): events + funnel + provider spend + attribution.
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SpendService, AttributionService],
  exports: [AnalyticsService, SpendService, AttributionService],
})
export class AnalyticsModule {}
