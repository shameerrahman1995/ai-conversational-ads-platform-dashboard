import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

/**
 * Developer-platform API keys (blueprint U7.1). Keys authenticate machine
 * callers, so the raw secret is a bearer credential: we store ONLY a SHA-256
 * hash plus a short non-secret prefix, and surface the full key exactly once —
 * at creation. It can never be retrieved again. Every query is org-scoped so a
 * caller only ever touches their own organization's keys.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Never ship the hash (or any credential material) to the client.
  private static readonly SAFE_SELECT = {
    id: true,
    name: true,
    prefix: true,
    lastUsedAt: true,
    createdAt: true,
    revokedAt: true,
  } as const;

  private static sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async list(orgId: string) {
    return this.prisma.apiKey.findMany({
      where: scopedWhere(orgId),
      select: ApiKeysService.SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(orgId: string, name: string, createdBy?: string) {
    // Full secret shown ONCE. prefix is the visible, non-secret leading segment;
    // hash is what we persist so the raw key never touches the database.
    const key = 'ck_live_' + randomBytes(24).toString('hex');
    const prefix = key.slice(0, 14);
    const hash = ApiKeysService.sha256Hex(key);

    const summary = await this.prisma.apiKey.create({
      data: { orgId, name, prefix, hash, createdBy },
      select: ApiKeysService.SAFE_SELECT,
    });
    // Audit metadata carries name + prefix only — NEVER the key or the hash.
    await this.audit.record({
      orgId,
      action: 'apikey.created',
      target: summary.id,
      metadata: { name, prefix },
    });
    return { ...summary, key };
  }

  async revoke(orgId: string, id: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: scopedWhere(orgId, { id }),
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('API key not found');

    const summary = await this.prisma.apiKey.update({
      where: { id, orgId },
      data: { revokedAt: new Date() },
      select: ApiKeysService.SAFE_SELECT,
    });
    await this.audit.record({ orgId, action: 'apikey.revoked', target: id });
    return summary;
  }
}
