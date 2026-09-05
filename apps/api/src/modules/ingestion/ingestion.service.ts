import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { STORAGE_PORT, type StoragePort } from '../../common/storage/storage.port';

export interface RegisterSourceInput {
  type: 'url' | 'pdf' | 'feed';
  uri?: string;
  filename?: string;
  contentType?: string;
}

/**
 * Product source ingestion (blueprint §10 Source ingestion). All reads/writes
 * are org-scoped; file sources get a short-lived signed upload URL and an asset
 * row that starts `scanClean=false` (cleared to true only after a malware scan
 * during parsing).
 */
@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async registerSource(orgId: string, input: RegisterSourceInput) {
    const source = await this.prisma.sourceDocument.create({
      data: { orgId, type: input.type, uri: input.uri ?? '' },
    });
    await this.audit.record({ orgId, action: 'source.registered', target: source.id });

    if (input.type !== 'url') {
      const key = `sources/${orgId}/${source.id}/${input.filename ?? 'upload'}`;
      await this.prisma.asset.create({
        data: {
          orgId,
          sourceDocId: source.id,
          kind: input.type,
          storageKey: key,
          checksum: '',
          scanClean: false,
        },
      });
      const signed = await this.storage.createSignedUploadUrl(
        key,
        input.contentType ?? 'application/octet-stream',
      );
      // Return the full source row (so the client has id/uri/parseStatus/createdAt)
      // plus sourceId + uploadUrl for the upload step.
      return { ...source, sourceId: source.id, uploadUrl: signed.url };
    }
    return { ...source, sourceId: source.id, uploadUrl: undefined as string | undefined };
  }

  async listSources(orgId: string) {
    return this.prisma.sourceDocument.findMany({ where: scopedWhere(orgId) });
  }

  async getStatus(orgId: string, sourceId: string) {
    const src = await this.prisma.sourceDocument.findFirst({
      where: scopedWhere(orgId, { id: sourceId }),
    });
    if (!src) throw new NotFoundException('Source not found');
    return src;
  }

  async listFacts(orgId: string, sourceId: string) {
    return this.prisma.sourceFact.findMany({
      where: scopedWhere(orgId, { sourceDocId: sourceId }),
    });
  }

  async approveFact(orgId: string, factId: string, approverId: string) {
    try {
      const fact = await this.prisma.sourceFact.update({
        where: { id: factId, orgId },
        data: { approved: true, approvedBy: approverId },
      });
      await this.audit.record({
        orgId,
        actorId: approverId,
        action: 'fact.approved',
        target: factId,
      });
      return fact;
    } catch (e) {
      this.translateNotFound(e, 'Fact not found');
    }
  }

  async rejectFact(orgId: string, factId: string) {
    try {
      await this.prisma.sourceFact.delete({ where: { id: factId, orgId } });
    } catch (e) {
      this.translateNotFound(e, 'Fact not found');
    }
    await this.audit.record({ orgId, action: 'fact.rejected', target: factId });
  }

  async deleteSource(orgId: string, sourceId: string) {
    const src = await this.prisma.sourceDocument.findFirst({
      where: scopedWhere(orgId, { id: sourceId }),
    });
    if (!src) throw new NotFoundException('Source not found');

    // Remove stored objects before the DB cascade drops their asset rows.
    const assets = await this.prisma.asset.findMany({
      where: scopedWhere(orgId, { sourceDocId: sourceId }),
    });
    for (const asset of assets) {
      try {
        await this.storage.deleteObject(asset.storageKey);
      } catch {
        // best-effort: the asset row is still removed by the cascade below
      }
    }

    await this.prisma.sourceDocument.delete({ where: { id: sourceId, orgId } });
    await this.audit.record({ orgId, action: 'source.deleted', target: sourceId });
  }

  /** Translate Prisma "record not found" (P2025) into a 404 instead of a 500. */
  private translateNotFound(e: unknown, message: string): never {
    if ((e as { code?: string }).code === 'P2025') throw new NotFoundException(message);
    throw e;
  }
}
