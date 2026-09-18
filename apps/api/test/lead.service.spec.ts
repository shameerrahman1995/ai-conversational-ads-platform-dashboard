import { describe, it, expect, vi } from 'vitest';
import { LeadService } from '../src/modules/lead/lead.service';
import { decryptField, encryptField } from '../src/common/crypto/field-crypto';

function deps(opts: { lead?: any; dup?: any; conversation?: any; messages?: any[] } = {}) {
  const prisma = {
    // Interactive-transaction callbacks run against the same mock.
    $transaction: (fn: any) => fn(prisma),
    lead: {
      create: vi.fn().mockResolvedValue({ id: 'l1' }),
      findFirst: vi.fn().mockResolvedValue('lead' in opts ? opts.lead : { id: 'l1', orgId: 'org_1' }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    leadFieldValue: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(opts.dup ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    consentRecord: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // Ownership check for a supplied conversationId (default: owned by the org).
    conversation: {
      findFirst: vi.fn().mockResolvedValue('conversation' in opts ? opts.conversation : { id: 'c1' }),
    },
    // Transcript read for getLead.
    message: { findMany: vi.fn().mockResolvedValue(opts.messages ?? []) },
  } as any;
  const audit = { record: vi.fn() } as any;
  const webhookDelivery = { dispatch: vi.fn().mockResolvedValue([]) } as any;
  return { prisma, audit, webhookDelivery };
}

function make(d: ReturnType<typeof deps>) {
  return new LeadService(d.prisma, d.audit, d.webhookDelivery);
}

describe('LeadService', () => {
  it('createLead stores lead + field values (with source) + consent, scoped and scored', async () => {
    const d = deps();
    const out = await make(d).createLead('org_1', {
      fields: { email: 'A@B.com', company: 'Acme' },
      fieldSources: { email: 'platform_form' },
      consents: [{ type: 'ai_disclosure', granted: true, disclosureVersion: 'v1' }],
      qualificationLevel: 'high',
    });
    expect(out.deduped).toBe(false);
    expect(out.score).toBeGreaterThan(0);
    expect(d.prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org_1', lifecycleStage: 'new' }),
      }),
    );
    const fieldArg = d.prisma.leadFieldValue.createMany.mock.calls[0][0].data;
    const emailRow = fieldArg.find((r: any) => r.field === 'email');
    expect(emailRow.source).toBe('platform_form');
    // PII is encrypted at rest, and decrypts back to the normalized value.
    expect(emailRow.value.startsWith('enc:v1:')).toBe(true);
    expect(decryptField(emailRow.value)).toBe('a@b.com');
    expect(d.prisma.consentRecord.createMany).toHaveBeenCalled();
    // A new, high-intent lead fires BOTH webhook domain events, keyed by leadId.
    expect(d.webhookDelivery.dispatch).toHaveBeenCalledWith(
      'org_1',
      'lead.created',
      expect.objectContaining({ leadId: 'l1' }),
      { dedupeSeed: 'l1' },
    );
    expect(d.webhookDelivery.dispatch).toHaveBeenCalledWith(
      'org_1',
      'lead.qualified',
      expect.objectContaining({ leadId: 'l1' }),
      { dedupeSeed: 'l1' },
    );
  });

  it('createLead dedupes on a matching email (no new lead, no webhook event)', async () => {
    const d = deps({ dup: { leadId: 'existing' } });
    const out = await make(d).createLead('org_1', { fields: { email: 'a@b.com' } });
    expect(out).toEqual({ leadId: 'existing', deduped: true });
    expect(d.prisma.lead.create).not.toHaveBeenCalled();
    // A dedupe is not a capture — no outbound event fires.
    expect(d.webhookDelivery.dispatch).not.toHaveBeenCalled();
    expect(d.prisma.leadFieldValue.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ field: 'email', value: 'a@b.com' }], lead: { orgId: 'org_1' } },
    });
  });

  // SECURITY (cross-tenant transcript disclosure): a caller-supplied conversationId
  // must be verified to belong to the org, else a spoofed id would link a lead to
  // another tenant's conversation and leak its decrypted transcript via getLead.
  it('createLead drops a conversationId that does not belong to the org', async () => {
    const d = deps({ conversation: null }); // ownership check finds nothing
    await make(d).createLead('org_1', { conversationId: 'convo-from-org-B', fields: { email: 'a@b.com' } });
    expect(d.prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org_1', id: 'convo-from-org-B' },
      select: { id: true },
    });
    expect(d.prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ conversationId: undefined }) }),
    );
  });

  it('createLead keeps a conversationId owned by the org', async () => {
    const d = deps({ conversation: { id: 'c1' } });
    await make(d).createLead('org_1', { conversationId: 'c1', fields: { email: 'a@b.com' } });
    expect(d.prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ conversationId: 'c1' }) }),
    );
  });

  it('getLead org-scopes the transcript read (never surfaces another tenant’s messages)', async () => {
    const d = deps({ messages: [{ role: 'user', contentRef: encryptField('hi'), createdAt: new Date() }] });
    d.prisma.lead.findFirst.mockResolvedValue({
      id: 'l1', orgId: 'org_1', conversationId: 'c1',
      fieldValues: [], consentRecords: [], deliveryAttempts: [],
    });
    const lead: any = await make(d).getLead('org_1', 'l1');
    expect(d.prisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'c1', orgId: 'org_1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(lead.transcript[0].content).toBe('hi');
  });

  it('getLead decrypts stored PII before returning it to the caller', async () => {
    const d = deps();
    d.prisma.lead.findFirst.mockResolvedValue({
      id: 'l1',
      orgId: 'org_1',
      fieldValues: [{ field: 'email', value: encryptField('a@b.com'), source: 'user_message' }],
      consentRecords: [],
      deliveryAttempts: [],
    });
    const lead: any = await make(d).getLead('org_1', 'l1');
    expect(lead.fieldValues[0].value).toBe('a@b.com');
  });

  it('listLeads is org-scoped with relations and a clamped default page size', async () => {
    const d = deps();
    await make(d).listLeads('org_1');
    expect(d.prisma.lead.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      include: { fieldValues: true, consentRecords: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  it('listLeads clamps an over-large limit and paginates by cursor', async () => {
    const d = deps();
    await make(d).listLeads('org_1', { limit: 100000, cursor: 'l9' });
    expect(d.prisma.lead.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      include: { fieldValues: true, consentRecords: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
      cursor: { id: 'l9' },
      skip: 1,
    });
  });

  it('assignOwner requires the lead and scopes the update', async () => {
    const d = deps();
    await make(d).assignOwner('org_1', 'l1', 'u1');
    expect(d.prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'l1', orgId: 'org_1' },
      data: { ownerId: 'u1' },
    });
  });

  it('deleteLead scopes the delete by org', async () => {
    const d = deps();
    await make(d).deleteLead('org_1', 'l1');
    expect(d.prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'l1', orgId: 'org_1' } });
  });

  it('merge moves field/consent rows to the target and deletes the source', async () => {
    const d = deps();
    await make(d).merge('org_1', 'src', 'tgt');
    expect(d.prisma.leadFieldValue.updateMany).toHaveBeenCalledWith({
      where: { leadId: 'src' },
      data: { leadId: 'tgt' },
    });
    expect(d.prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'src', orgId: 'org_1' } });
  });
});
