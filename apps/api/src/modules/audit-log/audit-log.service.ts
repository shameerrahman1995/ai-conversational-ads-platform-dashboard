import { Injectable } from '@nestjs/common';
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
