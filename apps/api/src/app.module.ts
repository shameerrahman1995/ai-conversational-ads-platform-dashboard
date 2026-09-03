import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { StorageModule } from './common/storage/storage.module';
import { ScannerModule } from './common/scanner/scanner.module';
import { IdentityModule } from './modules/identity/identity.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { CampaignIntelModule } from './modules/campaign-intel/campaign-intel.module';
import { CreativeModule } from './modules/creative/creative.module';
import { AgentRuntimeModule } from './modules/agent-runtime/agent-runtime.module';
import { LeadModule } from './modules/lead/lead.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { IntegrationHubModule } from './modules/integration-hub/integration-hub.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PolicyModule } from './modules/policy/policy.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    StorageModule,
    ScannerModule,
    IdentityModule,
    IngestionModule,
    CampaignIntelModule,
    CreativeModule,
    AgentRuntimeModule,
    LeadModule,
    PublishingModule,
    IntegrationHubModule,
    AnalyticsModule,
    PolicyModule,
    HealthModule,
  ],
})
export class AppModule {}
