import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { canTransitionConnector, type ConnectorStatus } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { ConnectorRegistry } from '../publishing/connector-registry';

type Conn = { id: string; provider: string; status: ConnectorStatus; secretRef: string | null };

/**
 * Non-ad providers (CRM, calendar, AI voice/video, webhooks) that connect through
 * a generic OAuth stub rather than the ad ConnectorRegistry. Ad platforms are
 * resolved via the registry; anything here is handled generically.
 */
const GENERIC_PROVIDERS = new Set<string>([
  'hubspot',
  'salesforce',
  'zoho',
  'google_calendar',
  'calendly',
  'elevenlabs',
  'deepgram',
  'heygen',
  'd_id',
  'webhook',
]);

const GENERIC_SCOPES: Record<string, string[]> = {
  hubspot: ['crm.objects.contacts.write', 'crm.schemas.read'],
  salesforce: ['api', 'refresh_token'],
  zoho: ['ZohoCRM.modules.ALL'],
  google_calendar: ['calendar.events'],
  calendly: ['scheduling'],
  elevenlabs: ['tts'],
  deepgram: ['stt'],
  heygen: ['avatar.render'],
  d_id: ['avatar.render'],
  webhook: [],
};

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

  private isAdProvider(provider: string): boolean {
    try {
      this.registry.get(provider);
      return true;
    } catch {
      return false;
    }
  }

  private assertKnownProvider(provider: string): void {
    if (!this.isAdProvider(provider) && !GENERIC_PROVIDERS.has(provider)) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  async startAuthorization(orgId: string, provider: string) {
    this.assertKnownProvider(provider); // ad platform OR generic (CRM/calendar/voice/video/webhook)
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
    if (this.isAdProvider(provider)) {
      const result = await this.registry.get(provider).authorize({ orgId, code });
      return this.transition(orgId, conn, 'CONNECTED', 'connection.connected', {
        secretRef: result.secretRef,
        scopes: result.scopes,
      });
    }
    // Generic provider (CRM/calendar/voice/video/webhook): stub OAuth exchange.
    // The token is never stored raw — only a secrets-manager reference.
    return this.transition(orgId, conn, 'CONNECTED', 'connection.connected', {
      secretRef: `secret::${provider}::${conn.id}`,
      scopes: GENERIC_SCOPES[provider] ?? [],
    });
  }

  async list(orgId: string) {
    return this.prisma.connection.findMany({ where: scopedWhere(orgId) });
  }

  async test(orgId: string, id: string) {
    const conn = await this.require(orgId, id);
    if (!this.isAdProvider(conn.provider)) {
      // Generic provider: a stub health check that always reports healthy.
      if (conn.status === 'DEGRADED') await this.transition(orgId, conn, 'CONNECTED', 'connection.recovered');
      return { ok: true, accounts: [] };
    }
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
    if (conn.secretRef && this.isAdProvider(conn.provider)) {
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
