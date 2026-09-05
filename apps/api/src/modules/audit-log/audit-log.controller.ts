import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('audit')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/audit')
@UseGuards(TenantGuard, RolesGuard)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @Roles('admin')
  @ApiQuery({ name: 'limit', required: false, description: 'Max rows (default 100)' })
  list(@Req() req: { orgId: string }, @Query('limit') limit?: string) {
    return this.auditLog.list(req.orgId, parseLimit(limit));
  }

  @Get('export')
  @Roles('admin')
  @ApiQuery({ name: 'limit', required: false, description: 'Max rows (default 100)' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit.csv"')
  export(@Req() req: { orgId: string }, @Query('limit') limit?: string) {
    return this.auditLog.exportCsv(req.orgId, parseLimit(limit));
  }
}

function parseLimit(limit?: string): number | undefined {
  if (limit == null) return undefined;
  const n = Number(limit);
  return Number.isFinite(n) ? n : undefined;
}
