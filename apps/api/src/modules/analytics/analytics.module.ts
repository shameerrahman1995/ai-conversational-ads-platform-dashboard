import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SpendService } from './spend.service';
import { AttributionService } from './attribution.service';
import { ProjectionsService } from './projections.service';
import { AnalyticsController } from './analytics.controller';

// Analytics (blueprint §13/§22): events + funnel + provider spend + attribution +
// dashboard projections (V10 U1.7: timeseries / insights / platform-health).
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SpendService, AttributionService, ProjectionsService],
  exports: [AnalyticsService, SpendService, AttributionService, ProjectionsService],
})
export class AnalyticsModule {}
