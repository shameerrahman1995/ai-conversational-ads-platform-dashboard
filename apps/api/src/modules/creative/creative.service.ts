import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { RENDERER, type RenderPort } from './render.port';
import { IMAGE_GENERATOR, type ImageGeneratorPort, type ImagePalette } from './image-gen.port';
import { validateOutputs, FORMAT_SPECS } from './format-spec';

/** On-brand palettes the adaptive generator rotates through. */
const PALETTES = [
  { bg: '#0f1729', text: '#ffffff', accent: '#4f46e5' },
  { bg: '#eef0fe', text: '#0f172a', accent: '#4f46e5' },
  { bg: '#052e2b', text: '#ecfdf5', accent: '#059669' },
  { bg: '#1e1b4b', text: '#ede9fe', accent: '#7c3aed' },
];

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
    @Inject(IMAGE_GENERATOR) private readonly imageGen: ImageGeneratorPort,
  ) {}

  /** Pixel dimensions for a creative format (square fallback). */
  private dimsFor(format: string): { width: number; height: number } {
    const spec = FORMAT_SPECS[format];
    if (spec?.width && spec?.height) return { width: spec.width, height: spec.height };
    return { width: 1080, height: 1080 };
  }

  /** Generate an image from a prompt for a given format + palette. */
  async generateImage(
    orgId: string,
    input: { prompt: string; format?: string; palette?: ImagePalette; subhead?: string },
  ) {
    const { width, height } = this.dimsFor(input.format ?? 'image_1_1');
    const result = await this.imageGen.generate(input.prompt || 'Your ad', {
      width,
      height,
      palette: input.palette,
      subhead: input.subhead,
    });
    await this.audit.record({
      orgId,
      action: 'creative.image_generated',
      target: input.format ?? 'image_1_1',
      metadata: { provider: result.provider },
    });
    return result;
  }

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

  /**
   * Create an AI "adaptive" ad set: one creative variant per requested format,
   * sharing grounded copy (from the campaign's latest generated version when
   * available, else the brief) plus a media placeholder + palette. Each variant
   * is fully customizable afterward via updateVariant.
   */
  async generateAdaptive(
    orgId: string,
    campaignId: string,
    opts: {
      brief?: string;
      formats: string[];
      mediaType?: 'image' | 'video' | 'audio' | 'none';
      brandVoice?: string;
      model?: string;
    },
  ) {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const latest = await this.prisma.campaignVersion.findFirst({
      where: { campaignId },
      orderBy: { version: 'desc' },
    });
    const copy = (latest?.snapshot as { copy?: { headline?: string; offer?: string; cta?: string } } | null)
      ?.copy;
    const brief = (opts.brief ?? '').trim();
    const headline = copy?.headline ?? (brief ? brief.slice(0, 60) : 'Your offer, made clear');
    const subhead = copy?.offer ?? (brief ? brief : 'On-brand, source-grounded creative.');
    const cta = copy?.cta ?? 'Get a free quote';
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const mediaType = opts.mediaType ?? 'image';

    const formats = opts.formats.length ? opts.formats : ['image_1_1', 'image_9_16'];
    const created = [];
    for (const format of formats) {
      // For image ads, generate an on-brand image per placement up front.
      let imageUrl = '';
      if (mediaType === 'image') {
        const { width, height } = this.dimsFor(format);
        try {
          imageUrl = (
            await this.imageGen.generate(headline, { width, height, palette, subhead })
          ).url;
        } catch {
          /* non-fatal — leave the placeholder, the editor can generate/upload later */
        }
      }
      const spec = {
        headline,
        subhead,
        cta,
        mediaType,
        imageUrl,
        videoUrl: '',
        audioUrl: '',
        bgColor: palette.bg,
        textColor: palette.text,
        accentColor: palette.accent,
        adaptive: true,
        brandVoice: opts.brandVoice ?? null,
        model: opts.model ?? null,
      };
      created.push(await this.createVariant(orgId, campaignId, format, spec));
    }
    await this.audit.record({
      orgId,
      action: 'creative.adaptive_generated',
      target: campaignId,
      metadata: { formats, mediaType, count: created.length },
    });
    return { created };
  }

  async updateVariant(
    orgId: string,
    variantId: string,
    patch: { spec?: Record<string, unknown>; status?: string },
  ) {
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const mergedSpec = patch.spec
      ? { ...(variant.spec as Record<string, unknown>), ...patch.spec }
      : (variant.spec as Record<string, unknown>);
    const updated = await this.prisma.creativeVariant.update({
      where: { id: variantId, orgId },
      data: { spec: mergedSpec as never, ...(patch.status ? { status: patch.status } : {}) },
    });
    await this.audit.record({ orgId, action: 'variant.updated', target: variantId });
    return updated;
  }

  async deleteVariant(orgId: string, variantId: string) {
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.prisma.creativeVariant.delete({ where: { id: variantId, orgId } });
    await this.audit.record({ orgId, action: 'variant.deleted', target: variantId });
    return { ok: true };
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
