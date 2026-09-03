import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditInput {
  orgId: string;
  actorId?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

/** Audit spine: 100% of privileged actions must be recorded (design doc §5 REL). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: input.action,
        target: input.target,
        metadata: input.metadata as never,
      },
    });
  }
}
