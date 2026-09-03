import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto, RegenerateFieldDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('campaigns')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/campaigns')
@UseGuards(TenantGuard, RolesGuard)
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Post()
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Body() dto: CreateCampaignDto) {
    return this.campaigns.createDraft(req.orgId, dto.objective, dto.name);
  }

  @Post(':id/generate')
  @Roles('creator')
  generate(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.campaigns.generate(req.orgId, id);
  }

  @Post(':id/regenerate')
  @Roles('creator')
  regenerate(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: RegenerateFieldDto) {
    return this.campaigns.regenerateField(req.orgId, id, dto.field);
  }

  @Get(':id/versions')
  @Roles('creator')
  versions(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.campaigns.getVersions(req.orgId, id);
  }
}
