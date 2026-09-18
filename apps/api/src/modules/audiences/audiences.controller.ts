import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AudiencesService } from './audiences.service';
import { CreateAudienceDto, ListAudiencesQueryDto, UpdateAudienceDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('audiences')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@Controller('v1/audiences')
@UseGuards(TenantGuard, RolesGuard)
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  @Get()
  @Roles('creator', 'analyst')
  list(@Req() req: { orgId: string }, @Query() query: ListAudiencesQueryDto) {
    return this.audiences.list(req.orgId, query.kind);
  }

  @Get(':id')
  @Roles('creator', 'analyst')
  get(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.audiences.get(req.orgId, id);
  }

  @Post()
  @Roles('creator')
  create(
    @Req() req: { orgId: string; user?: { userId?: string } },
    @Body() dto: CreateAudienceDto,
  ) {
    return this.audiences.create(req.orgId, dto, req.user?.userId);
  }

  @Patch(':id')
  @Roles('creator')
  update(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: UpdateAudienceDto) {
    return this.audiences.update(req.orgId, id, dto);
  }

  @Delete(':id')
  @Roles('creator')
  remove(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.audiences.remove(req.orgId, id);
  }
}
