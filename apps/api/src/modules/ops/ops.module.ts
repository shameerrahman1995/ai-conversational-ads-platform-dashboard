import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { PlatformOpsController } from './platform-ops.controller';

/**
 * Ops / SRE surface (Wave 3, P2 reliability): dead-letter-queue visibility and
 * replay. {@link OpsController} is the tenant-scoped surface (`/v1/admin/jobs`,
 * org-filtered); {@link PlatformOpsController} is the cross-tenant platform
 * super-admin console (`/v1/platform/jobs`). Both controllers inject
 * JobsAdminService, which the global JobsModule exports, so no providers are
 * declared here.
 */
@Module({
  controllers: [OpsController, PlatformOpsController],
})
export class OpsModule {}
