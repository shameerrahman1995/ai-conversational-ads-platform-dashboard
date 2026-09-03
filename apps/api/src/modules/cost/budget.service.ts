import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { selectModelTier, type ModelTier } from './model-tier';

export interface BudgetStatus {
  configured: boolean; // false = no budget row; callers decide policy (no silent "unlimited")
  monthToDate: number;
  limit: number;
  remaining: number | null; // null = unlimited (limit 0 or unconfigured)
  remainingPct: number | null;
  overBudget: boolean;
  alert: boolean;
  tier: ModelTier;
}

/**
 * Cost controls (blueprint §22 / risk register "AI/voice cost exceeds revenue"):
 * per-tenant monthly budget, usage recording, threshold alerts, and model
 * tiering. Org-scoped + audited.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async setBudget(orgId: string, monthlyLimitUsd: number, alertThresholdPct = 80) {
    const budget = await this.prisma.budget.upsert({
      where: { orgId },
      update: { monthlyLimitUsd, alertThresholdPct },
      create: { orgId, monthlyLimitUsd, alertThresholdPct },
    });
    await this.audit.record({ orgId, action: 'budget.set', metadata: { monthlyLimitUsd } });
    return budget;
  }

  async recordUsage(
    orgId: string,
    usage: { sessionId?: string; kind: string; units: number; cost: number },
  ): Promise<BudgetStatus> {
    await this.prisma.usageRecord.create({
      data: {
        orgId,
        sessionId: usage.sessionId,
        kind: usage.kind,
        units: usage.units,
        cost: usage.cost,
      },
    });
    const status = await this.getStatus(orgId);
    if (status.alert) {
      await this.prisma.event.create({
        data: {
          orgId,
          type: 'budget.alert',
          payload: { monthToDate: status.monthToDate, limit: status.limit, overBudget: status.overBudget },
        },
      });
    }
    return status;
  }

  async getStatus(orgId: string): Promise<BudgetStatus> {
    const budget = await this.prisma.budget.findUnique({ where: { orgId } });
    const limit = budget?.monthlyLimitUsd ?? 0;
    const thresholdPct = budget?.alertThresholdPct ?? 80;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const agg = await this.prisma.usageRecord.aggregate({
      _sum: { cost: true },
      where: scopedWhere(orgId, { createdAt: { gte: monthStart } }),
    });
    const monthToDate = agg._sum?.cost ?? 0;

    const unlimited = limit <= 0;
    const remaining = unlimited ? null : Math.max(0, limit - monthToDate);
    const remainingPct = unlimited ? null : Math.max(0, ((limit - monthToDate) / limit) * 100);
    const overBudget = !unlimited && monthToDate >= limit;
    const alert = !unlimited && monthToDate >= limit * (thresholdPct / 100);

    return {
      configured: budget !== null,
      monthToDate,
      limit,
      remaining,
      remainingPct,
      overBudget,
      alert,
      tier: selectModelTier(remainingPct),
    };
  }
}
