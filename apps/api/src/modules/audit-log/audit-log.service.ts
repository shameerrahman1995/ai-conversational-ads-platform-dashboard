import { Injectable } from '@nestjs/common';
import { Prisma } from '@acp/db';
import { PrismaService } from '../../prisma/prisma.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Read/export access over the audit spine (blueprint §5 REL / P1). The write side
 * lives in the global AuditService; this only reads org-scoped AuditEvent rows.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, limit?: number) {
    return this.prisma.auditEvent.findMany({
      where: scopedWhere(orgId),
      orderBy: { createdAt: 'desc' },
      take: clampLimit(limit),
    });
  }

  /**
   * PLATFORM (cross-tenant) read over the audit spine. Unlike {@link list}, this
   * deliberately does NOT apply {@link scopedWhere} — it reads AuditEvent rows
   * across EVERY org, so it must only ever be reachable behind PlatformAdminGuard
   * (see PlatformAuditController). Every returned row carries its `orgId`, so the
   * operator can see which tenant an event belongs to. Newest first, capped.
   *
   * Optional filters narrow the cross-tenant view:
   *  - `orgId`   — restrict to a single tenant (opt-in, never applied otherwise).
   *  - `action`  — prefix match on the action string (e.g. `platform.`).
   *  - `actorId` — exact actor.
   */
  async listAllTenants(
    params: { limit?: number; orgId?: string; action?: string; actorId?: string } = {},
  ) {
    const { limit, orgId, action, actorId } = params;
    // No scopedWhere here: this surface is cross-tenant by design. Start empty
    // (reads all orgs) and narrow only for the filters the operator supplies.
    const where: Prisma.AuditEventWhereInput = {};
    if (orgId) where.orgId = orgId;
    if (actorId) where.actorId = actorId;
    if (action) where.action = { startsWith: action };
    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: clampLimit(limit),
    });
  }

  async exportCsv(orgId: string, limit?: number): Promise<string> {
    const rows = await this.list(orgId, limit);
    const header = ['id', 'createdAt', 'actorId', 'action', 'target', 'metadata'];
    const lines = rows.map((r) =>
      [
        r.id,
        r.createdAt.toISOString(),
        r.actorId ?? '',
        r.action,
        r.target ?? '',
        r.metadata == null ? '' : JSON.stringify(r.metadata),
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }
}

function clampLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/**
 * RFC-4180 CSV escaping + formula-injection neutralization. A leading
 * =, +, -, @, tab, or CR makes spreadsheet apps execute the cell as a formula,
 * so prefix those with an apostrophe before quoting.
 */
function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
