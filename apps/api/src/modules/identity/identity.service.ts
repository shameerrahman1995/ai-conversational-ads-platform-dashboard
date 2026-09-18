import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole, UserStatus } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { hashPassword } from '../../common/auth/password';
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

  // Never ship credential material or internal columns to the client.
  private static readonly SAFE_ORG_SELECT = {
    id: true,
    name: true,
    plan: true,
    status: true,
    region: true,
    createdAt: true,
  } as const;

  /**
   * The full workspace view for the Settings surface — the safe org columns plus
   * the tenant-configurable `settings` (currency/timezone/feature flags) and
   * `branding` (logo/accent) JSON blobs, and `updatedAt`.
   */
  private static readonly WORKSPACE_SELECT = {
    id: true,
    name: true,
    plan: true,
    status: true,
    region: true,
    settings: true,
    branding: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  /**
   * Suspend an org member (admin-gated in the controller). Refuses to suspend
   * the last remaining *active* admin so an organization can never lock itself
   * out of member management (mirrors the last-admin guard in changeUserRole).
   * Org-scoped + audited; returns the same safe user summary shape.
   */
  async suspendUser(orgId: string, userId: string, actorId?: string) {
    const target = await this.prisma.user.findFirst({
      where: scopedWhere(orgId, { id: userId }),
      select: IdentityService.SAFE_USER_SELECT,
    });
    if (!target) throw new NotFoundException('User not found');

    // Last-admin protection: refuse to suspend the only active admin in the org.
    if (target.role === 'admin') {
      const activeAdminCount = await this.prisma.user.count({
        where: scopedWhere(orgId, { role: 'admin' as UserRole, status: 'active' as UserStatus }),
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Cannot suspend the last remaining active admin in the organization');
      }
    }

    if (target.status === 'suspended') return target; // no-op, nothing to audit

    const updated = await this.prisma.user.update({
      where: { id: userId, orgId },
      data: { status: 'suspended' },
      select: IdentityService.SAFE_USER_SELECT,
    });
    await this.audit.record({
      orgId,
      actorId,
      action: 'user.suspended',
      target: userId,
      metadata: { from: target.status, to: 'suspended' },
    });
    return updated;
  }

  /**
   * Reactivate a suspended org member. Org-scoped + audited; returns the safe
   * user summary shape.
   */
  async reactivateUser(orgId: string, userId: string, actorId?: string) {
    const target = await this.prisma.user.findFirst({
      where: scopedWhere(orgId, { id: userId }),
      select: IdentityService.SAFE_USER_SELECT,
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.status === 'active') return target; // no-op, nothing to audit

    const updated = await this.prisma.user.update({
      where: { id: userId, orgId },
      data: { status: 'active' },
      select: IdentityService.SAFE_USER_SELECT,
    });
    await this.audit.record({
      orgId,
      actorId,
      action: 'user.reactivated',
      target: userId,
      metadata: { from: target.status, to: 'active' },
    });
    return updated;
  }

  /**
   * Set an org member's password (admin-gated in the controller). The plaintext
   * is hashed with the scrypt util and the TOTP replay guard (`mfaLastStep`) is
   * cleared so a rotated credential starts from a clean replay window.
   * Org-scoped + audited; returns ONLY the id — never the hash.
   */
  async resetUserPassword(orgId: string, userId: string, password: string, actorId?: string) {
    const target = await this.prisma.user.findFirst({
      where: scopedWhere(orgId, { id: userId }),
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId, orgId },
      // Clear the TOTP replay state so the new credential is not tied to a stale
      // last-consumed time-step.
      data: { passwordHash: hashPassword(password), mfaLastStep: null },
      select: { id: true },
    });
    await this.audit.record({
      orgId,
      actorId,
      action: 'user.password_reset',
      target: userId,
    });
    return { id: userId };
  }

  /**
   * Return the caller's own organization profile. Org-scoped to `orgId`
   * (Organization's primary key is the tenant id) and limited to the safe,
   * client-facing columns.
   */
  async getCurrentOrg(orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: IdentityService.SAFE_ORG_SELECT,
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Update the caller's org profile. ONLY `name` and `region` are mutable here —
   * `plan` and `status` are platform-admin controlled and are never accepted on
   * this tenant-facing path. Org-scoped + audited.
   */
  async updateOrgProfile(
    orgId: string,
    changes: { name?: string; region?: string },
    actorId?: string,
  ) {
    const data: { name?: string; region?: string } = {};
    if (changes.name !== undefined) data.name = changes.name;
    if (changes.region !== undefined) data.region = changes.region;

    const existing = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: IdentityService.SAFE_ORG_SELECT,
    });
    if (!existing) throw new NotFoundException('Organization not found');

    if (Object.keys(data).length === 0) return existing; // no-op, nothing to audit

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data,
      select: IdentityService.SAFE_ORG_SELECT,
    });
    await this.audit.record({
      orgId,
      actorId,
      action: 'org.profile_updated',
      target: orgId,
      metadata: data,
    });
    return updated;
  }

  /**
   * The caller's full workspace view (Settings §U7.1): safe org columns plus the
   * `settings` and `branding` JSON blobs. Org-scoped to `orgId`.
   */
  async getWorkspace(orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: IdentityService.WORKSPACE_SELECT,
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Update the caller's workspace: `name`/`region` plus the `settings` and
   * `branding` JSON blobs. The JSON blobs are shallow-merged into whatever is
   * stored, so a partial patch (e.g. only the accent) never wipes sibling keys.
   * `plan`/`status` are platform-admin controlled and are never accepted here.
   * Org-scoped + audited.
   */
  async updateWorkspace(
    orgId: string,
    changes: {
      name?: string;
      region?: string;
      settings?: Record<string, unknown>;
      branding?: Record<string, unknown>;
    },
    actorId?: string,
  ) {
    const existing = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: IdentityService.WORKSPACE_SELECT,
    });
    if (!existing) throw new NotFoundException('Organization not found');

    const data: {
      name?: string;
      region?: string;
      settings?: Record<string, unknown>;
      branding?: Record<string, unknown>;
    } = {};
    if (changes.name !== undefined) data.name = changes.name;
    if (changes.region !== undefined) data.region = changes.region;
    if (changes.settings !== undefined) {
      data.settings = { ...asJsonObject(existing.settings), ...changes.settings };
    }
    if (changes.branding !== undefined) {
      data.branding = { ...asJsonObject(existing.branding), ...changes.branding };
    }

    if (Object.keys(data).length === 0) return existing; // no-op, nothing to audit

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      // `as never`: the Json columns accept a plain object at runtime; the cast
      // keeps Prisma's InputJsonValue typing happy without importing it here.
      data: data as never,
      select: IdentityService.WORKSPACE_SELECT,
    });
    await this.audit.record({
      orgId,
      actorId,
      action: 'org.workspace_updated',
      target: orgId,
      metadata: { fields: Object.keys(data) },
    });
    return updated;
  }

  /**
   * Danger-zone: record an ownership-transfer request. This does NOT actually
   * reassign ownership (that is a platform-admin/offline step); it durably
   * records the intent on the org's `settings.pendingTransfer` and audits it, so
   * the request is honest and attributable. Org-scoped + admin-gated (controller).
   */
  async requestOrgTransfer(
    orgId: string,
    input: { email: string; note?: string },
    actorId?: string,
  ) {
    const existing = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: IdentityService.WORKSPACE_SELECT,
    });
    if (!existing) throw new NotFoundException('Organization not found');

    const pendingTransfer = {
      toEmail: input.email,
      note: input.note ?? null,
      requestedBy: actorId ?? null,
      requestedAt: new Date().toISOString(),
      status: 'pending' as const,
    };
    const settings = { ...asJsonObject(existing.settings), pendingTransfer };
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { settings: settings as never },
      select: IdentityService.WORKSPACE_SELECT,
    });
    await this.audit.record({
      orgId,
      actorId,
      action: 'org.transfer_requested',
      target: orgId,
      metadata: { toEmail: input.email },
    });
    return { id: updated.id, pendingTransfer };
  }

  /**
   * Danger-zone: delete/close the workspace. The caller must echo the workspace
   * name exactly (typed confirmation). To keep the action honest AND non-
   * destructive (a real cascade-delete is irreversible and would break the
   * demo), this SUSPENDS the workspace — reversible by a platform admin — rather
   * than dropping tenant data. Audited.
   */
  async deleteOrg(orgId: string, confirm: string, actorId?: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: IdentityService.WORKSPACE_SELECT,
    });
    if (!org) throw new NotFoundException('Organization not found');

    if (!confirm || confirm.trim() !== org.name) {
      throw new BadRequestException('Confirmation does not match the workspace name');
    }

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { status: 'suspended' },
      select: IdentityService.WORKSPACE_SELECT,
    });
    await this.audit.record({
      orgId,
      actorId,
      action: 'org.deletion_requested',
      target: orgId,
      metadata: { previousStatus: org.status, newStatus: 'suspended' },
    });
    return { id: updated.id, status: updated.status };
  }
}

/**
 * Coerce a Prisma Json value into a plain object for shallow-merging. Arrays and
 * primitives (and null) collapse to an empty object so a merge never spreads a
 * non-object.
 */
function asJsonObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
