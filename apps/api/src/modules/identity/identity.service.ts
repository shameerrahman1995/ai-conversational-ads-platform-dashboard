import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { USER_ROLES } from './dto';

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

  /**
   * Change an org member's role (admin-gated in the controller). Refuses to
   * demote the last remaining admin so an organization can never lock itself out
   * of member management. Org-scoped + audited; returns the same safe user
   * summary shape the list endpoint returns.
   */
  async changeUserRole(orgId: string, userId: string, role: UserRole) {
    if (!USER_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }
    const target = await this.prisma.user.findFirst({
      where: scopedWhere(orgId, { id: userId }),
      select: IdentityService.SAFE_USER_SELECT,
    });
    if (!target) throw new NotFoundException('User not found');

    // Last-admin protection: if the target is currently the only admin in the
    // org, refuse to move them off the admin role.
    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await this.prisma.user.count({
        where: scopedWhere(orgId, { role: 'admin' as UserRole }),
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot demote the last remaining admin in the organization');
      }
    }

    if (target.role === role) return target; // no-op, nothing to audit

    const updated = await this.prisma.user.update({
      where: { id: userId, orgId },
      data: { role },
      select: IdentityService.SAFE_USER_SELECT,
    });
    await this.audit.record({
      orgId,
      action: 'user.role_changed',
      target: userId,
      metadata: { from: target.role, to: role },
    });
    return updated;
  }
}
