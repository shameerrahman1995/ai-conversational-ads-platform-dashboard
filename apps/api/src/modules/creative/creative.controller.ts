import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { CreativeService } from './creative.service';
import { Html5CompilerService } from './html5-compiler.service';
import type { CreativeManifest } from '@acp/shared-types';
import {
  CompileBundleDto,
  CompileHtml5Dto,
  CreateVariantDto,
  GenerateAdaptiveDto,
  GenerateImageDto,
  UpdateVariantDto,
} from './dto';
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

  @Post('variants/:id/html5/bundle')
  @Roles('creator')
  compileBundle(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: CompileBundleDto) {
    const manifest: CreativeManifest = {
      creativeId: dto.creativeId,
      tenantId: dto.tenantId,
      productId: dto.productId,
      agentId: dto.agentId,
      size: { width: dto.size.width, height: dto.size.height },
      mode: dto.mode as CreativeManifest['mode'],
      features: {
        textChat: dto.features.textChat,
        voice: dto.features.voice as CreativeManifest['features']['voice'],
        gallery: dto.features.gallery,
        leadCapture: dto.features.leadCapture,
      },
      allowedActions: dto.allowedActions as CreativeManifest['allowedActions'],
      edgeApiBase: dto.edgeApiBase,
      signedCreativeToken: dto.signedCreativeToken,
    };
    return this.html5.compileBundle(req.orgId, id, {
      template: dto.template,
      network: dto.network,
      manifest,
      copy: dto.copy,
    });
  }

  @Get('creative/html5/preview-policy')
  @Roles('creator')
  previewPolicy() {
    return this.html5.previewPolicy();
  }

  @Post('creative/generate-image')
  @Roles('creator')
  generateImage(@Req() req: { orgId: string }, @Body() dto: GenerateImageDto) {
    return this.creative.generateImage(req.orgId, dto);
  }

  @Post('campaigns/:id/variants')
  @Roles('creator')
  create(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.creative.createVariant(req.orgId, id, dto.format, dto.spec);
  }

  @Post('campaigns/:id/creative/generate')
  @Roles('creator')
  generateAdaptive(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: GenerateAdaptiveDto) {
    return this.creative.generateAdaptive(req.orgId, id, dto);
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

  @Patch('variants/:id')
  @Roles('creator')
  update(@Req() req: { orgId: string }, @Param('id') id: string, @Body() dto: UpdateVariantDto) {
    return this.creative.updateVariant(req.orgId, id, dto);
  }

  @Delete('variants/:id')
  @Roles('creator')
  remove(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.creative.deleteVariant(req.orgId, id);
  }

  @Get('variants/:id')
  @Roles('creator')
  get(@Req() req: { orgId: string }, @Param('id') id: string) {
    return this.creative.getVariant(req.orgId, id);
  }
}
