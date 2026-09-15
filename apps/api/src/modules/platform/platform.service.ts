import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { OrgPlanValue } from './dto';

/** How long an impersonation ("view as org") session token is valid. */
const IMPERSONATION_TTL_SECONDS = 30 * 60;

/**
 * Platform (cross-tenant) super-admin operations — reachable ONLY behind
 * {@link PlatformAdminGuard}. These are the sanctioned cross-org reads/writes:
 * they deliberately do NOT pass through `scopedWhere` (the guard is what makes
 * that safe). Every mutation is audited against the TARGET org, stamped with the
 * acting super-admin, so cross-tenant actions are fully attributable.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Start an impersonation ("view as org") session. Mints a SHORT-LIVED token
   * scoped to the target org so the super-admin can operate the tenant's own
   * admin tools on their behalf. The token deliberately carries `platformAdmin:
   * false` — while impersonating they are confined to this one tenant and cannot
   * reach the platform console — and an `act` claim naming the real actor for
   * attribution. Audited against the target org.
   */
  async impersonate(orgId: string, actor: { userId: string; email?: string }) {
    const org = await this.requireOrg(orgId);
    const token = await this.jwt.signAsync(
      {
        sub: actor.userId,
        orgId: org.id,
        role: 'admin',
        email: actor.email ?? '',
        platformAdmin: false,
        act: actor.userId, // the real (platform-admin) actor behind this session
        imp: true,
      },
      { expiresIn: `${IMPERSONATION_TTL_SECONDS}s` },
    );
    await this.audit.record({
      orgId: org.id,
      actorId: actor.userId,
      action: 'platform.impersonation_started',
      target: org.id,
      metadata: { org: org.name },
    });
    return { token, org: { id: org.id, name: org.name }, expiresIn: IMPERSONATION_TTL_SECONDS };
  }

  /** Every organization on the platform, newest first, with headline counts. */
  async listOrgs() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, campaigns: true, leads: true } } },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      plan: o.plan,
      status: o.status,
      region: o.region,
      createdAt: o.createdAt,
      members: o._count.users,
      campaigns: o._count.campaigns,
      leads: o._count.leads,
    }));
  }

  /** One organization with a richer breakdown for the detail view. */
  async getOrg(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        budget: true,
        _count: {
          select: { users: true, campaigns: true, leads: true, publishJobs: true, agentVersions: true },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      status: org.status,
      region: org.region,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      budget: org.budget
        ? { monthlyLimitUsd: org.budget.monthlyLimitUsd, alertThresholdPct: org.budget.alertThresholdPct }
        : null,
      counts: org._count,
    };
  }

  async suspendOrg(orgId: string, actorId?: string) {
    return this.setStatus(orgId, 'suspended', 'platform.org_suspended', actorId);
  }

  async reactivateOrg(orgId: string, actorId?: string) {
    return this.setStatus(orgId, 'active', 'platform.org_reactivated', actorId);
  }

  async changePlan(orgId: string, plan: OrgPlanValue, actorId?: string) {
    const org = await this.requireOrg(orgId);
    if (org.plan === plan) return { id: org.id, plan: org.plan };
    const updated = await this.prisma.organization.update({ where: { id: orgId }, data: { plan } });
    await this.audit.record({
      orgId,
      actorId,
      action: 'platform.org_plan_changed',
      target: orgId,
      metadata: { from: org.plan, to: plan },
    });
    return { id: updated.id, plan: updated.plan };
  }

  private async setStatus(
    orgId: string,
    status: 'active' | 'suspended',
    action: string,
    actorId?: string,
  ) {
    await this.requireOrg(orgId);
    const updated = await this.prisma.organization.update({ where: { id: orgId }, data: { status } });
    await this.audit.record({ orgId, actorId, action, target: orgId, metadata: { status } });
    return { id: updated.id, status: updated.status };
  }

  private async requireOrg(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }
}
