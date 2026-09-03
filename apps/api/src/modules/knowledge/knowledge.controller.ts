import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { QueryDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('knowledge')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/knowledge')
@UseGuards(TenantGuard, RolesGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Post('query')
  @Roles('creator')
  query(@Req() req: { orgId: string }, @Body() dto: QueryDto) {
    return this.knowledge.retrieve(req.orgId, dto.query, dto.k);
  }
}
