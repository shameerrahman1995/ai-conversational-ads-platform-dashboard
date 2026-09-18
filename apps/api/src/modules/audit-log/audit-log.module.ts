import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { PlatformAuditController } from './platform-audit.controller';

// Audit read/export (blueprint §5 REL / P1): org-scoped AuditEvent list + CSV,
// plus the cross-tenant platform explorer (PlatformAdminGuard) for super-admins.
@Module({
  controllers: [AuditLogController, PlatformAuditController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
