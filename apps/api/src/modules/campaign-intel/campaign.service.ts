import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import {
  COPY_GENERATOR,
  type CampaignCopy,
  type CopyField,
  type CopyGeneratorPort,
} from './copy-generator.port';

export interface ClaimAnnotation {
  text: string;
  supported: boolean; // false => shown as "Needs verification"
}

export interface CampaignSnapshot {
  copy: CampaignCopy;
  claims: ClaimAnnotation[];
}

const REGENERATABLE: CopyField[] = ['headline', 'offer', 'cta'];

/**
 * Campaign intelligence (blueprint §5/§10): generate versioned copy from
 * APPROVED facts, annotate every claim with source support ("Needs verification"
 * otherwise), and regenerate a single field into a NEW version — never mutating a
 * live version in place. All queries org-scoped and audited.
 */
@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(COPY_GENERATOR) private readonly generator: CopyGeneratorPort,
  ) {}

  async createDraft(orgId: string, objective: string, name?: string, vertical?: string) {
    const campaign = await this.prisma.campaign.create({
      data: { orgId, objective, name, vertical, status: 'DRAFT', version: 1 },
    });
    await this.audit.record({ orgId, action: 'campaign.created', target: campaign.id });
    return campaign;
  }

  async generate(orgId: string, campaignId: string) {
    await this.requireCampaign(orgId, campaignId);
    const facts = await this.approvedFacts(orgId);
    const snapshot = this.annotate(this.generator.generate(facts), facts);
    return this.commitVersion(orgId, campaignId, snapshot, 'campaign.generated');
  }

  async regenerateField(orgId: string, campaignId: string, field: CopyField) {
    if (!REGENERATABLE.includes(field)) throw new BadRequestException(`Unsupported field: ${field}`);
    await this.requireCampaign(orgId, campaignId);
    const latest = await this.prisma.campaignVersion.findFirst({
      where: { campaignId },
      orderBy: { version: 'desc' },
    });
    if (!latest) throw new BadRequestException('Generate the campaign before regenerating a field');

    const facts = await this.approvedFacts(orgId);
    const prevCopy = (latest.snapshot as unknown as CampaignSnapshot).copy;
    const fresh = this.generator.generate(facts);
    const newCopy: CampaignCopy = { ...prevCopy, [field]: fresh[field] };
    const snapshot = this.annotate(newCopy, facts);
    return this.commitVersion(orgId, campaignId, snapshot, 'campaign.field_regenerated', { field });
  }

  async listCampaigns(orgId: string) {
    return this.prisma.campaign.findMany({ where: scopedWhere(orgId) });
  }

  async getVersions(orgId: string, campaignId: string) {
    await this.requireCampaign(orgId, campaignId);
    return this.prisma.campaignVersion.findMany({
      where: { campaignId },
      orderBy: { version: 'asc' },
    });
  }

  // ---- internals ----

  private async requireCampaign(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(orgId, { id: campaignId }),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  private async approvedFacts(orgId: string): Promise<string[]> {
    const rows = await this.prisma.sourceFact.findMany({
      where: scopedWhere(orgId, { approved: true }),
    });
    return rows.map((r: { text: string }) => r.text);
  }

  private annotate(copy: CampaignCopy, facts: string[]): CampaignSnapshot {
    const set = new Set(facts.map((f) => f.trim().toLowerCase()));
    const claim = (text: string): ClaimAnnotation => ({
      text,
      supported: set.has(text.trim().toLowerCase()),
    });
    const claims = [claim(copy.headline), claim(copy.offer), claim(copy.cta), ...copy.proofPoints.map(claim)];
    return { copy, claims };
  }

  private async commitVersion(
    orgId: string,
    campaignId: string,
    snapshot: CampaignSnapshot,
    action: string,
    extra?: Record<string, unknown>,
  ) {
    const version = (await this.prisma.campaignVersion.count({ where: { campaignId } })) + 1;
    await this.prisma.campaignVersion.create({
      data: { campaignId, version, snapshot: snapshot as never },
    });
    await this.prisma.campaign.update({
      where: { id: campaignId, orgId },
      data: { version, status: 'GENERATED' },
    });
    await this.audit.record({ orgId, action, target: campaignId, metadata: { version, ...extra } });
    return { version, snapshot };
  }
}
