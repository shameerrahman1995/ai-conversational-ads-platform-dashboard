import { describe, it, expect, vi } from 'vitest';
import { LeadService } from '../src/modules/lead/lead.service';
import { decryptField, encryptField } from '../src/common/crypto/field-crypto';

function deps(opts: { lead?: any; dup?: any } = {}) {
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
  } as any;
  const audit = { record: vi.fn() } as any;
  return { prisma, audit };
}

function make(d: ReturnType<typeof deps>) {
  return new LeadService(d.prisma, d.audit);
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
  });

  it('createLead dedupes on a matching email (no new lead)', async () => {
    const d = deps({ dup: { leadId: 'existing' } });
    const out = await make(d).createLead('org_1', { fields: { email: 'a@b.com' } });
    expect(out).toEqual({ leadId: 'existing', deduped: true });
    expect(d.prisma.lead.create).not.toHaveBeenCalled();
    expect(d.prisma.leadFieldValue.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ field: 'email', value: 'a@b.com' }], lead: { orgId: 'org_1' } },
    });
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

  it('listLeads is org-scoped with relations', async () => {
    const d = deps();
    await make(d).listLeads('org_1');
    expect(d.prisma.lead.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      include: { fieldValues: true, consentRecords: true },
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
