import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { RENDERER, type RenderPort } from './render.port';
import { validateOutputs } from './format-spec';

/**
 * Creative rendering (blueprint §10): compile a variant into the multi-format
 * output set, validate against format specs, and store an artifact manifest.
 * Org-scoped + audited.
 */
@Injectable()
export class CreativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(RENDERER) private readonly renderer: RenderPort,
  ) {}

  async createVariant(orgId: string, campaignId: string, format: string, spec: unknown) {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const variant = await this.prisma.creativeVariant.create({
      data: { orgId, campaignId, format, spec: spec as never, status: 'draft' },
    });
    await this.audit.record({ orgId, action: 'variant.created', target: variant.id });
    return variant;
  }

  async render(orgId: string, variantId: string) {
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const outputs = this.renderer.render(variant.spec);
    const validation = validateOutputs(outputs);
    const manifest = { outputs, validation };
    const status = validation.ok ? 'rendered' : 'validation_failed';

    await this.prisma.creativeVariant.update({
      where: { id: variantId, orgId },
      data: { manifest: manifest as never, status },
    });
    await this.audit.record({
      orgId,
      action: 'variant.rendered',
      target: variantId,
      metadata: { status, issues: validation.issues.length },
    });
    return { status, manifest };
  }

  async listVariants(orgId: string, campaignId: string) {
    return this.prisma.creativeVariant.findMany({ where: scopedWhere(orgId, { campaignId }) });
  }

  async getVariant(orgId: string, variantId: string) {
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }
}
