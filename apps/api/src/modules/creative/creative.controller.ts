import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { CreativeService } from './creative.service';
import { Html5CompilerService } from './html5-compiler.service';
import { CompileHtml5Dto, CreateVariantDto } from './dto';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';

@ApiTags('creative')
@ApiHeader({ name: 'x-org-id', required: true, description: 'Caller organization id (MVP auth stub)' })
@ApiHeader({ name: 'x-user-role', required: true, description: 'Caller role (MVP auth stub)' })
@UseGuards(TenantGuard, RolesGuard)
@Controller('v1')
export class CreativeController {
  constructor(
    private readonly creative: CreativeService,
    private readonly html5: Html5CompilerService,
  ) {}

  @Post('variants/:id/html5/compile')
  @Roles('creator')
  compileHtml5(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: CompileHtml5Dto) {
    return this.html5.compile(req.orgId, id, dto);
  }

  @Get('creative/html5/preview-policy')
  @Roles('creator')
  previewPolicy() {
    return this.html5.previewPolicy();
  }

  @Post('campaigns/:id/variants')
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.creative.createVariant(req.orgId, id, dto.format, dto.spec);
  }

  @Get('campaigns/:id/variants')
  @Roles('creator')
  list(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.creative.listVariants(req.orgId, id);
  }

  @Post('variants/:id/render')
  @Roles('creator')
  render(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.creative.render(req.orgId, id);
  }

  @Get('variants/:id')
  @Roles('creator')
  get(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.creative.getVariant(req.orgId, id);
  }
}
