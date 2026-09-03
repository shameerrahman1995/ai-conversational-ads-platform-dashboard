import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { IngestionService } from './ingestion.service';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('ingestion')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/facts')
@UseGuards(TenantGuard, RolesGuard)
export class FactsController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post(':id/approve')
  @Roles('reviewer')
  approve(@Req() req: { orgId: string; headers: Record<string, string> }, @Param('id') id: string) {
    const approverId = req.headers['x-user-id'] ?? 'unknown';
    return this.ingestion.approveFact(req.orgId, id, approverId);
  }

  @Post(':id/reject')
  @Roles('reviewer')
  reject(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.ingestion.rejectFact(req.orgId, id);
  }
}
