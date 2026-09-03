import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { computeFunnel, type FunnelEvent, type FunnelFilter } from './funnel';

/**
 * Analytics (blueprint §13): append-only event ingestion + funnel with creative
 * and agent-version dimensions. Org-scoped. Events are immutable (append only).
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(orgId: string, type: string, payload: Record<string, unknown> = {}) {
    return this.prisma.event.create({ data: { orgId, type, payload: payload as never } });
  }

  async funnel(orgId: string, filter: FunnelFilter = {}) {
    const events = (await this.prisma.event.findMany({
      where: scopedWhere(orgId),
      select: { type: true, payload: true },
    })) as unknown as FunnelEvent[];
    return { ...computeFunnel(events, filter), dimensions: filter };
  }
}
