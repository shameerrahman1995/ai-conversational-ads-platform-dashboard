import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@acp/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import type { AudienceKind, CreateAudienceDto, UpdateAudienceDto } from './dto';

/**
 * Audiences (V10 U2.2): reusable, versioned audience definitions shared across
 * campaigns and channels. Two kinds live in one table — `segment` (a targetable
 * definition) and `personalization` (a rule mapping a segment to an approved
 * creative variant). Every row is org-scoped + audited.
 */
@Injectable()
export class AudiencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** List the org's audiences, optionally filtered to one kind, newest first. */
  async list(orgId: string, kind?: AudienceKind) {
    return this.prisma.audience.findMany({
      where: scopedWhere(orgId, kind ? { kind } : undefined),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Fetch a single org-scoped audience or 404. */
  async get(orgId: string, id: string) {
    const audience = await this.prisma.audience.findFirst({
      where: scopedWhere(orgId, { id }),
    });
    if (!audience) throw new NotFoundException('Audience not found');
    return audience;
  }

  async create(orgId: string, dto: CreateAudienceDto, createdBy?: string) {
    const audience = await this.prisma.audience.create({
      data: {
        orgId,
        name: dto.name,
        kind: dto.kind,
        description: dto.description ?? null,
        definition: (dto.definition ?? {}) as Prisma.InputJsonValue,
        estimatedSize: dto.estimatedSize ?? null,
        createdBy: createdBy ?? null,
      },
    });
    await this.audit.record({
      orgId,
      action: 'audience.created',
      target: audience.id,
      metadata: { kind: audience.kind },
    });
    return audience;
  }

  async update(orgId: string, id: string, dto: UpdateAudienceDto) {
    // Confirm the row exists AND belongs to the caller's org before mutating it.
    await this.get(orgId, id);
    const data: Prisma.AudienceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.definition !== undefined) data.definition = dto.definition as Prisma.InputJsonValue;
    if (dto.estimatedSize !== undefined) data.estimatedSize = dto.estimatedSize;
    const audience = await this.prisma.audience.update({ where: { id, orgId }, data });
    await this.audit.record({ orgId, action: 'audience.updated', target: id });
    return audience;
  }

  async remove(orgId: string, id: string) {
    await this.get(orgId, id);
    await this.prisma.audience.delete({ where: { id, orgId } });
    await this.audit.record({ orgId, action: 'audience.deleted', target: id });
    return { ok: true as const };
  }
}
