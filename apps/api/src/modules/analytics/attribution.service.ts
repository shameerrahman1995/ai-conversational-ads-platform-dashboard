import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

export interface AttributionWindow {
  since?: string;
  until?: string;
}

/**
 * Attribution (blueprint §22): cost-per-qualified-lead and ROAS. Provider spend
 * (SpendMetric) and internal qualified leads (Lead.qualified) are combined only
 * for these derived ratios and reported with their sources noted separately.
 * Org-scoped.
 */
@Injectable()
export class AttributionService {
  constructor(private readonly prisma: PrismaService) {}

  async report(orgId: string, window: AttributionWindow = {}) {
    const spendWhere = scopedWhere(orgId) as Record<string, unknown>;
    if (window.since || window.until) {
      spendWhere.date = {
        ...(window.since ? { gte: window.since } : {}),
        ...(window.until ? { lte: window.until } : {}),
      };
    }
    const spendRows = (await this.prisma.spendMetric.findMany({ where: spendWhere })) as Array<{
      spend: number;
    }>;
    const spend = spendRows.reduce((s, r) => s + r.spend, 0);

    const leadWhere = scopedWhere(orgId, { qualified: true }) as Record<string, unknown>;
    if (window.since || window.until) {
      leadWhere.createdAt = {
        ...(window.since ? { gte: new Date(window.since) } : {}),
        ...(window.until ? { lte: new Date(window.until) } : {}),
      };
    }
    const qualifiedRows = (await this.prisma.lead.findMany({
      where: leadWhere,
      select: { revenue: true },
    })) as Array<{ revenue: number | null }>;
    const qualifiedLeads = qualifiedRows.length;
    const revenue = qualifiedRows.reduce((s, l) => s + (l.revenue ?? 0), 0);

    return {
      window,
      spend, // source: provider
      qualifiedLeads, // source: internal
      revenue, // source: CRM feedback
      costPerQualifiedLead: qualifiedLeads > 0 ? spend / qualifiedLeads : null,
      roas: spend > 0 ? revenue / spend : null,
      note: 'Provider spend and internal qualified-lead counts are sourced separately; ratios are derived.',
    };
  }
}
