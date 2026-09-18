import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The blueprint-synced publish path (the real architectural seam): when a
 * CreativeVariant carries a full CreativeManifest (written by the Studio's
 * blueprint→variant sync), executePublish must ship THAT manifest — with its
 * REAL agent id — and mint a fresh short-lived token, instead of synthesizing a
 * manifest with the `agent:<campaignId>` placeholder. Legacy variants (no such
 * manifest) still fall back to the synthesized placeholder for back-compat.
 *
 * We force the LIVE Google HTML5 path via a config mock and capture the manifest
 * handed to the bundle builder (mocked so no real ZIP work runs).
 */

// Force the live Google HTML5 publish branch of resolvePublishSpec.
vi.mock('@acp/config', async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    loadEnv: () => ({
      ...actual.loadEnv(),
      PROVIDERS_MODE: 'live',
      API_BASE_URL: 'https://edge.example.test',
    }),
  };
});

// Capture the manifest/copy given to the bundle builder; skip real ZIP work.
const { buildCreativeBundle } = vi.hoisted(() => ({ buildCreativeBundle: vi.fn() }));
vi.mock('../src/modules/creative/html5/bundle-builder', () => ({ buildCreativeBundle }));

import { PublishService } from '../src/modules/publishing/publish.service';
import { PolicyService } from '../src/modules/policy/policy.service';

function connector() {
  return {
    capabilities: vi.fn().mockResolvedValue({
      platform: 'google_ads',
      accountId: 'acct',
      supportedFormats: ['html5'],
      supportsHtml5: true,
      supportsNativeLeadForms: false,
      objectives: [],
      regions: [],
      placements: [],
    }),
    uploadAssets: vi.fn().mockResolvedValue([{ remoteAssetId: 'asset_1' }]),
    createDraft: vi
      .fn()
      .mockResolvedValue({ provider: 'google_ads', accountId: 'acct', campaignId: 'draft1', revision: 1 }),
    publish: vi.fn().mockResolvedValue({
      provider: 'google_ads',
      accountId: 'acct',
      campaignId: 'draft1',
      adId: 'ad1',
      revision: 1,
      reviewStatus: 'in_review',
    }),
  };
}

function deps(variant: any) {
  const conn = connector();
  const prisma = {
    campaign: {
      findFirst: vi.fn().mockResolvedValue({ id: 'c1', orgId: 'org_1', status: 'APPROVED', settings: {} }),
      update: vi.fn().mockResolvedValue({ id: 'c1' }),
    },
    creativeVariant: { findFirst: vi.fn().mockResolvedValue(variant) },
    publishJob: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'p1',
        orgId: 'org_1',
        platform: 'google_ads',
        variantId: 'v1',
        accountId: 'acct',
        idempotencyKey: 'v1:google_ads:acct',
        snapshotId: 'cv1',
        status: 'APPROVED',
        remoteId: null,
      }),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'p1', ...data })),
    },
    remoteObject: { create: vi.fn().mockResolvedValue({ id: 'ro1' }) },
  } as any;
  const audit = { record: vi.fn() } as any;
  const registry = { get: vi.fn().mockReturnValue(conn) } as any;
  const jobs = { enqueuePublish: vi.fn() } as any;
  const svc = new PublishService(prisma, audit, registry, jobs, new PolicyService());
  return { svc, prisma, conn };
}

const blueprintSyncedManifest = {
  creativeId: 'v1',
  tenantId: 'org_1',
  productId: 'c1',
  agentId: 'agent_real_1',
  size: { width: 300, height: 250 },
  mode: 'interactive_ai',
  features: { textChat: true, voice: 'off', gallery: false, leadCapture: true },
  allowedActions: ['show_specs', 'capture_lead', 'open_url'],
  edgeApiBase: 'https://edge.example.test',
  signedCreativeToken: '', // persisted blank — must be minted fresh at publish
};

describe('publish uses the blueprint-synced variant manifest', () => {
  beforeEach(() => {
    buildCreativeBundle.mockReset();
    buildCreativeBundle.mockResolvedValue({
      files: {},
      fileList: [],
      zip: Buffer.from('zip-bytes'),
      zipBytes: 9,
    });
  });

  it("ships the REAL agent id from the stored manifest (no `agent:<campaignId>` placeholder)", async () => {
    const variant = {
      id: 'v1',
      campaignId: 'c1',
      orgId: 'org_1',
      format: 'html5',
      spec: { headline: 'Talk to our AI', body: 'Ask anything', finalUrl: 'https://land.test' },
      manifest: blueprintSyncedManifest,
    };
    const { svc } = deps(variant);

    const out: any = await svc.executePublish('org_1', 'p1');
    expect(out.status).toBe('IN_REVIEW');

    expect(buildCreativeBundle).toHaveBeenCalledTimes(1);
    const arg = buildCreativeBundle.mock.calls[0][0] as any;
    // REAL agent id shipped — not the placeholder.
    expect(arg.manifest.agentId).toBe('agent_real_1');
    expect(arg.manifest.agentId).not.toMatch(/^agent:/);
    // A fresh short-lived token is minted at publish (never the persisted blank).
    expect(arg.manifest.signedCreativeToken).toBeTruthy();
    expect(arg.manifest.signedCreativeToken).not.toBe('');
    // Copy is built from the blueprint-derived spec.
    expect(arg.copy.hook).toBe('Talk to our AI');
    expect(arg.copy.subhead).toBe('Ask anything');
    expect(arg.copy.finalUrl).toBe('https://land.test');
  });

  it('legacy variant with no CreativeManifest falls back to the synthesized placeholder', async () => {
    const variant = {
      id: 'v1',
      campaignId: 'c1',
      orgId: 'org_1',
      format: 'html5',
      spec: { headline: 'Legacy', finalUrl: 'https://land.test' },
      manifest: null, // never blueprint-synced
    };
    const { svc } = deps(variant);

    await svc.executePublish('org_1', 'p1');

    const arg = buildCreativeBundle.mock.calls[0][0] as any;
    expect(arg.manifest.agentId).toBe('agent:c1'); // back-compat placeholder preserved
    expect(arg.manifest.signedCreativeToken).toBeTruthy();
  });
});
