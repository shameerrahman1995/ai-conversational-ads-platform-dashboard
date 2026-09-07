import { Injectable } from '@nestjs/common';
import type { UserRole } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';

/**
 * Identity & tenancy (blueprint §10). All user queries are scoped by `orgId`
 * so a caller can only ever see their own organization's records.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createOrg(name: string, region = 'us') {
    const org = await this.prisma.organization.create({ data: { name, region } });
    await this.audit.record({ orgId: org.id, action: 'org.created', target: org.id });
    return org;
  }

  // Never ship credential material or internal columns to the client.
  private static readonly SAFE_USER_SELECT = {
    id: true,
    orgId: true,
    email: true,
    name: true,
    role: true,
    status: true,
    createdAt: true,
  } as const;

  async listUsers(orgId: string) {
    return this.prisma.user.findMany({
      where: scopedWhere(orgId),
      select: IdentityService.SAFE_USER_SELECT,
    });
  }

  async inviteUser(orgId: string, email: string, role: UserRole) {
    const user = await this.prisma.user.create({
      data: { orgId, email, role, status: 'invited' },
      select: IdentityService.SAFE_USER_SELECT,
    });
    await this.audit.record({
      orgId,
      action: 'user.invited',
      target: user.id,
      metadata: { email, role },
    });
    return user;
  }
}
