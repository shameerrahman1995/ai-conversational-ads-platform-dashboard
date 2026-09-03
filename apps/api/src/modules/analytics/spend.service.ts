import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { ConnectorRegistry } from '../publishing/connector-registry';

export interface SpendFilter {
  provider?: string;
  since?: string;
  until?: string;
}

/**
 * Spend / performance import (blueprint §8/§22). Pulls provider metrics via the
 * connector and stores them idempotently per remote object per day. These are
 * PROVIDER-sourced numbers, surfaced separately from the internal funnel so the
 * two are never conflated. Org-scoped + audited.
 */
@Injectable()
export class SpendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ConnectorRegistry,
  ) {}

  async importMetrics(orgId: string, provider: string, accountId: string, since: string, until: string) {
    const rows = await this.registry
      .get(provider)
      .fetchMetrics({ accountId, since, until, secretRef: '' });
    for (const r of rows) {
      await this.prisma.spendMetric.upsert({
        where: {
          orgId_provider_remoteId_date: { orgId, provider, remoteId: r.remoteId, date: r.date },
        },
        update: {
          accountId,
          impressions: r.impressions,
          clicks: r.clicks,
          spend: r.spend,
          currency: r.currency,
        },
        create: {
          orgId,
          provider,
          accountId,
          remoteId: r.remoteId,
          date: r.date,
          impressions: r.impressions,
          clicks: r.clicks,
          spend: r.spend,
          currency: r.currency,
        },
      });
    }
    await this.audit.record({
      orgId,
      action: 'analytics.spend_imported',
      metadata: { provider, count: rows.length },
    });
    return { imported: rows.length, source: 'provider' as const };
  }

  async getSpend(orgId: string, filter: SpendFilter = {}) {
    const where = scopedWhere(orgId) as Record<string, unknown>;
    if (filter.provider) where.provider = filter.provider;
    if (filter.since || filter.until) {
      where.date = { ...(filter.since ? { gte: filter.since } : {}), ...(filter.until ? { lte: filter.until } : {}) };
    }
    const rows = (await this.prisma.spendMetric.findMany({ where })) as Array<{
      provider: string;
      impressions: number;
      clicks: number;
      spend: number;
      currency: string;
    }>;

    const totals = { impressions: 0, clicks: 0, spend: 0 };
    const byProvider: Record<string, { impressions: number; clicks: number; spend: number }> = {};
    for (const r of rows) {
      totals.impressions += r.impressions;
      totals.clicks += r.clicks;
      totals.spend += r.spend;
      const p = (byProvider[r.provider] ??= { impressions: 0, clicks: 0, spend: 0 });
      p.impressions += r.impressions;
      p.clicks += r.clicks;
      p.spend += r.spend;
    }
    return { source: 'provider' as const, totals, byProvider };
  }
}
