import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { canTransitionConnector, type ConnectorStatus } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { ConnectorRegistry } from '../publishing/connector-registry';

type Conn = { id: string; provider: string; status: ConnectorStatus; secretRef: string | null };

/**
 * Ad-platform connection lifecycle (blueprint §8/§14): authorize -> connect ->
 * test -> rotate -> reauth (on 401) -> revoke, enforcing the connector state
 * machine. Provider tokens are held only as `secretRef` references, never raw.
 * Org-scoped + audited.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ConnectorRegistry,
  ) {}

  async startAuthorization(orgId: string, provider: string) {
    this.registry.get(provider); // validates the provider is supported
    let conn = (await this.prisma.connection.findFirst({
      where: scopedWhere(orgId, { provider }),
    })) as Conn | null;
    if (!conn) {
      conn = (await this.prisma.connection.create({
        data: { orgId, provider, status: 'DISCONNECTED' },
      })) as Conn;
    }
    const updated = await this.transition(orgId, conn, 'AUTHORIZING', 'connection.authorize_started');
    return {
      connectionId: updated.id,
      authUrl: `https://auth.example.com/${provider}/oauth?state=${updated.id}`,
    };
  }

  async completeAuthorization(orgId: string, provider: string, code: string) {
    const conn = (await this.prisma.connection.findFirst({
      where: scopedWhere(orgId, { provider }),
    })) as Conn | null;
    if (!conn) throw new NotFoundException('Start authorization first');
    const result = await this.registry.get(provider).authorize({ orgId, code });
    return this.transition(orgId, conn, 'CONNECTED', 'connection.connected', {
      secretRef: result.secretRef,
      scopes: result.scopes,
    });
  }

  async list(orgId: string) {
    return this.prisma.connection.findMany({ where: scopedWhere(orgId) });
  }

  async test(orgId: string, id: string) {
    const conn = await this.require(orgId, id);
    try {
      const accounts = await this.registry
        .get(conn.provider)
        .listAccounts({ secretRef: conn.secretRef ?? '' });
      if (conn.status === 'DEGRADED') await this.transition(orgId, conn, 'CONNECTED', 'connection.recovered');
      return { ok: true, accounts };
    } catch {
      if (canTransitionConnector(conn.status, 'DEGRADED')) {
        await this.transition(orgId, conn, 'DEGRADED', 'connection.degraded');
      }
      return { ok: false, accounts: [] };
    }
  }

  async rotate(orgId: string, id: string) {
    const conn = await this.require(orgId, id);
    const result = await this.registry.get(conn.provider).authorize({ orgId });
    const updated = await this.prisma.connection.update({
      where: { id, orgId },
      data: { secretRef: result.secretRef, scopes: result.scopes },
    });
    await this.audit.record({ orgId, action: 'connection.rotated', target: id });
    return updated;
  }

  /** Called when a downstream provider call returns 401 (token expiry, §8). */
  async markReauthRequired(orgId: string, id: string) {
    const conn = await this.require(orgId, id);
    return this.transition(orgId, conn, 'REAUTH_REQUIRED', 'connection.reauth_required');
  }

  async disconnect(orgId: string, id: string) {
    const conn = await this.require(orgId, id);
    if (conn.secretRef) {
      await this.registry
        .get(conn.provider)
        .revoke({ secretRef: conn.secretRef })
        .catch(() => undefined);
    }
    return this.transition(orgId, conn, 'REVOKED', 'connection.revoked', { secretRef: null });
  }

  // ---- internals ----

  private async transition(
    orgId: string,
    conn: Conn,
    to: ConnectorStatus,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    if (conn.status !== to && !canTransitionConnector(conn.status, to)) {
      throw new BadRequestException(`Invalid connection transition: ${conn.status} -> ${to}`);
    }
    const updated = await this.prisma.connection.update({
      where: { id: conn.id, orgId },
      data: { status: to, ...extra },
    });
    await this.audit.record({ orgId, action, target: conn.id, metadata: { status: to } });
    return updated;
  }

  private async require(orgId: string, id: string): Promise<Conn> {
    const conn = await this.prisma.connection.findFirst({ where: scopedWhere(orgId, { id }) });
    if (!conn) throw new NotFoundException('Connection not found');
    return conn as unknown as Conn;
  }
}
