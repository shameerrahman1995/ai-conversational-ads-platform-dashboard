import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';

/**
 * Platform (cross-tenant) super-admin module — the first surface of the admin
 * panel's Phase 0 foundation. PrismaService + AuditService are global; access is
 * gated per-route by PlatformAdminGuard (a verified platformAdmin JWT claim).
 */
@Module({
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
