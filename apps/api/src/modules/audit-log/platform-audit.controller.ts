import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { PlatformAuditQueryDto } from './dto';
import { PlatformAdminGuard } from '../../common/rbac/platform-admin.guard';

/**
 * Platform (cross-tenant) audit explorer for super-admins. Unlike the tenant
 * `AuditLogController` (which is org-scoped and gated by TenantGuard/RolesGuard),
 * this reads AuditEvent rows across EVERY org and is gated ONLY by
 * {@link PlatformAdminGuard} — which requires a verified JWT carrying
 * `platformAdmin` (a tenant `admin` cannot reach it, and there is no dev-header
 * path in). The global JwtAuthGuard runs first to populate `req.user`.
 */
@ApiTags('platform')
@ApiHeader({ name: 'authorization', required: true, description: 'Bearer JWT of a platform super-admin' })
@Controller('v1/platform/audit')
@UseGuards(PlatformAdminGuard)
export class PlatformAuditController {
  constructor(private readonly auditLog: AuditLogService) {}

  /** Cross-tenant audit events, newest first. Optional filters narrow the view. */
  @Get()
  list(@Query() query: PlatformAuditQueryDto) {
    return this.auditLog.listAllTenants({
      limit: query.limit,
      orgId: query.orgId,
      action: query.action,
      actorId: query.actorId,
    });
  }
}
