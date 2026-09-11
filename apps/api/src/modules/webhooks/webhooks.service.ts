import { Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import { safeFetchDeliver } from '../ingestion/parsing/safe-fetch';

/**
 * Outbound webhook subscriptions (blueprint U7.1). Each webhook carries a
 * signing `secret` used to HMAC-SHA256 every delivery so receivers can verify
 * authenticity. The secret is a credential: it is returned ONCE at creation and
 * never exposed by the list endpoint. All queries are org-scoped.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Never ship the signing secret to the client after creation.
  private static readonly SAFE_SELECT = {
    id: true,
    url: true,
    events: true,
    status: true,
    lastDeliveryAt: true,
    lastStatus: true,
    createdAt: true,
  } as const;

  async list(orgId: string) {
    return this.prisma.webhook.findMany({
      where: scopedWhere(orgId),
      select: WebhooksService.SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(orgId: string, url: string, events: string[], createdBy?: string) {
    // Signing secret shown ONCE; it never appears in the list projection again.
    const secret = 'whsec_' + randomBytes(24).toString('hex');
    const summary = await this.prisma.webhook.create({
      data: { orgId, url, events, secret, createdBy },
      select: WebhooksService.SAFE_SELECT,
    });
    // Audit metadata carries url + events only — NEVER the secret.
    await this.audit.record({
      orgId,
      action: 'webhook.created',
      target: summary.id,
      metadata: { url, events },
    });
    return { ...summary, secret };
  }

  async remove(orgId: string, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.webhook.findFirst({
      where: scopedWhere(orgId, { id }),
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Webhook not found');

    await this.prisma.webhook.delete({ where: { id, orgId } });
    await this.audit.record({ orgId, action: 'webhook.deleted', target: id });
    return { ok: true };
  }

  async test(orgId: string, id: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: scopedWhere(orgId, { id }),
      select: { id: true, url: true, secret: true },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const createdAt = new Date().toISOString();
    const payload = {
      type: 'ping',
      createdAt,
      data: { message: 'Conversa Ads test event' },
    };
    const bodyString = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    // HMAC-SHA256 over the exact bytes we send, prefixed `sha256=` so receivers
    // can select the algorithm — the same secret verifies it on the other side.
    const signature =
      'sha256=' + createHmac('sha256', webhook.secret).update(bodyString).digest('hex');

    const deliveredAt = new Date();
    let ok = false;
    let status: string;
    try {
      const res = await this.deliver(webhook.url, bodyString, {
        'Content-Type': 'application/json',
        'X-Conversa-Signature': signature,
        'X-Conversa-Timestamp': timestamp,
      });
      ok = res.status >= 200 && res.status < 300;
      status = String(res.status);
    } catch (err) {
      // Honesty: an SSRF block, timeout, or connection error is recorded as a
      // failure — we never fabricate a 2xx for a delivery that did not happen.
      ok = false;
      status = 'error: ' + (err instanceof Error ? err.message : String(err));
    }

    await this.prisma.webhook.update({
      where: { id, orgId },
      data: { lastDeliveryAt: deliveredAt, lastStatus: status },
    });
    await this.audit.record({
      orgId,
      action: 'webhook.tested',
      target: id,
      metadata: { url: webhook.url, status },
    });

    return { ok, status, deliveredAt: deliveredAt.toISOString() };
  }

  /**
   * SSRF-guarded POST delivery. Isolated in one method so unit tests can stub it
   * without touching the network; production reuses the ingestion SSRF guard.
   */
  protected async deliver(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<{ status: number }> {
    return safeFetchDeliver(url, { method: 'POST', headers, body, timeoutMs: 5_000 });
  }
}
