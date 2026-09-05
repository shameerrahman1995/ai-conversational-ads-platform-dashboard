import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RequestContextMiddleware } from './common/context/request-context.middleware';
import { JobsModule } from './jobs/jobs.module';
import { AuditModule } from './common/audit/audit.module';
import { StorageModule } from './common/storage/storage.module';
import { ScannerModule } from './common/scanner/scanner.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { IdentityModule } from './modules/identity/identity.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { CampaignIntelModule } from './modules/campaign-intel/campaign-intel.module';
import { CreativeModule } from './modules/creative/creative.module';
import { AgentRuntimeModule } from './modules/agent-runtime/agent-runtime.module';
import { LeadModule } from './modules/lead/lead.module';
import { AdConnectorsModule } from './modules/publishing/connectors.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { CostModule } from './modules/cost/cost.module';
import { IntegrationHubModule } from './modules/integration-hub/integration-hub.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PolicyModule } from './modules/policy/policy.module';
import { RetentionModule } from './modules/retention/retention.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    PrismaModule,
    JobsModule,
    AuditModule,
    StorageModule,
    ScannerModule,
    KnowledgeModule,
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
    AdConnectorsModule,
    ConnectionsModule,
    ExperimentsModule,
    EngagementModule,
    CostModule,
    RetentionModule,
    PrivacyModule,
    AuditLogModule,
    HealthModule,
  ],
  providers: [
    // Global auth (default-deny; @Public() opts out) + rate limiting.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
