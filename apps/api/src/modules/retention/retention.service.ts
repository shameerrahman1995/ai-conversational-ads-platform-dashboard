import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

/** Days a message transcript is retained before it is redacted (P1 retention). */
export const MESSAGE_RETENTION_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SweepResult {
  messagesRedacted: number;
  chunksDeleted: number;
}

/**
 * Data-retention sweep (blueprint §11 / P1). Two independent controls:
 *  (a) message transcripts past the retention window are redacted in place —
 *      `redactedAt` is stamped and `contentRef` is overwritten with a tombstone,
 *      so the row survives (audit/analytics counts) but the content is gone; and
 *  (b) knowledge chunks past their `expiresAt` are deleted outright.
 *
 * NOTE: a scheduler/cron should call `sweep()` (no orgId = all tenants) on a
 * daily cadence. The admin endpoint runs it on demand, scoped to one org.
 */
@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async sweep(orgId?: string): Promise<SweepResult> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - MESSAGE_RETENTION_DAYS * DAY_MS);

    // Messages carry no orgId column; scope through their conversation.
    const messages = await this.prisma.message.updateMany({
      where: {
        createdAt: { lt: cutoff },
        redactedAt: null,
        ...(orgId ? { conversation: { orgId } } : {}),
      },
      data: { contentRef: '[redacted]', redactedAt: now },
    });

    const chunks = await this.prisma.knowledgeChunk.deleteMany({
      where: { expiresAt: { lt: now }, ...(orgId ? { orgId } : {}) },
    });

    const result: SweepResult = {
      messagesRedacted: messages.count,
      chunksDeleted: chunks.count,
    };

    // Audit per-org runs (the on-demand admin path). A global cron sweep has no
    // single org to attribute, so it is not audited here.
    if (orgId) {
      await this.audit.record({ orgId, action: 'retention.sweep', metadata: { ...result } });
    }

    return result;
  }
}
