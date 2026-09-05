import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { RetentionService } from './retention.service';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('retention')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/admin/retention')
@UseGuards(TenantGuard, RolesGuard)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  // On-demand retention sweep for the caller's org; a cron should also run it.
  @Post('run')
  @Roles('admin')
  run(@Req() req: { orgId: string }) {
    return this.retention.sweep(req.orgId);
  }
}
