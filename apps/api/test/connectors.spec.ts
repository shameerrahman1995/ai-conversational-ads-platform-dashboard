import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AmazonDspConnector,
  GenericExportConnector,
  GoogleAdsConnector,
  LinkedInConnector,
  MetaConnector,
  MicrosoftConnector,
  TikTokConnector,
} from '../src/modules/publishing/connectors/adapters';
import { ConnectorRegistry } from '../src/modules/publishing/connector-registry';
import {
  GoogleAdsLiveClient,
  assertSafeLabel,
  safeMarker,
} from '../src/modules/publishing/connectors/google-ads.live';

describe('ad connector stubs', () => {
  it('google exposes HTML5 + the 150KB uploaded-HTML5 display limit', async () => {
    const caps = await new GoogleAdsConnector().capabilities({ accountId: 'a', secretRef: '' });
    expect(caps.platform).toBe('google_ads');
    expect(caps.supportsHtml5).toBe(true);
    // Google Ads uploaded-HTML5 display limit is 150KB (DV360/Studio allows more).
    expect(caps.maxBundleBytes).toBe(150_000);
  });

  it('meta supports native lead forms + carousel', async () => {
    const caps = await new MetaConnector().capabilities({ accountId: 'a', secretRef: '' });
    expect(caps.supportsNativeLeadForms).toBe(true);
    expect(caps.supportedFormats).toContain('carousel');
  });

  it('publish returns a remote-object map carrying the snapshot in the ad id', async () => {
    const remote = await new GenericExportConnector().publish({
      draftRemoteId: 'd1',
      snapshotId: 's1',
      idempotencyKey: 'k',
      secretRef: '',
    });
    expect(remote.provider).toBe('generic_export');
    expect(remote.adId).toContain('s1');
  });

  it('Phase 4 connectors expose sensible capabilities', async () => {
    const tiktok = await new TikTokConnector().capabilities({ accountId: 'a', secretRef: '' });
    expect(tiktok.platform).toBe('tiktok');
    expect(tiktok.supportedFormats).toContain('video');
    expect(tiktok.supportsNativeLeadForms).toBe(true);

    const linkedin = await new LinkedInConnector().capabilities({ accountId: 'a', secretRef: '' });
    expect(linkedin.supportedFormats).toContain('native_form_schema');

    expect((await new MicrosoftConnector().capabilities({ accountId: 'a', secretRef: '' })).supportsHtml5).toBe(true);
    expect((await new AmazonDspConnector().capabilities({ accountId: 'a', secretRef: '' })).supportsHtml5).toBe(true);
  });

  it('registry resolves all 7 platforms and rejects unknown', () => {
    const reg = new ConnectorRegistry(
      new GoogleAdsConnector(),
      new MetaConnector(),
      new GenericExportConnector(),
      new TikTokConnector(),
      new MicrosoftConnector(),
      new AmazonDspConnector(),
      new LinkedInConnector(),
    );
    for (const p of ['google_ads', 'meta', 'generic_export', 'tiktok', 'microsoft', 'amazon_dsp', 'linkedin']) {
      expect(reg.get(p).platform).toBe(p);
    }
    expect(() => reg.get('nope')).toThrow();
  });
});

/* ---- Google Ads deterministic-naming + idempotency (Lane 3) ------------- */

describe('safeMarker / assertSafeLabel', () => {
  it('safeMarker derives a stable, injection-safe [A-Za-z0-9_] marker from a key', () => {
    // The plan's idempotencyKey is variant:platform:account → collapses to _.
    expect(safeMarker('v1:google_ads:acct')).toBe('v1_google_ads_acct');
    // Stable across calls (this is what makes ensure* idempotent on retry).
    expect(safeMarker('v1:google_ads:acct')).toBe(safeMarker('v1:google_ads:acct'));
    // Injection chars (quotes/backslash) never survive.
    expect(/^[A-Za-z0-9_]+$/.test(safeMarker("x' OR '1'='1"))).toBe(true);
  });

  it('safeMarker rejects an empty/blank key', () => {
    expect(() => safeMarker('')).toThrow(/deterministic label/i);
    expect(() => safeMarker('   ')).toThrow(/deterministic label/i);
  });

  it('assertSafeLabel rejects GAQL string-literal injection', () => {
    expect(assertSafeLabel('ConvoAds v1_google_ads_acct')).toBe('ConvoAds v1_google_ads_acct');
    expect(() => assertSafeLabel("ConvoAds' OR '1'='1")).toThrow(/invalid/i);
    expect(() => assertSafeLabel('back\\slash')).toThrow(/invalid/i);
  });
});

describe('GoogleAdsLiveClient ensure* idempotency (query-before-create)', () => {
  const config = {
    clientId: 'c',
    clientSecret: 's',
    developerToken: 'd',
    refreshToken: 'r',
    loginCustomerId: '1234567890',
    defaultCustomerId: '1234567890',
    apiVersion: 'v25',
  };
  const CID = '1234567890';

  const makeRes = (body: unknown, ok = true, status = 200) => ({
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  });

  function installFetch(handler: (url: string, init?: any) => any) {
    const calls: { url: string; init?: any }[] = [];
    const orig = (global as any).fetch;
    (global as any).fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    });
    return { calls, restore: () => ((global as any).fetch = orig) };
  }

  afterEach(() => vi.restoreAllMocks());

  it('REUSES an existing campaign/ad-group/ad on retry — no duplicate :mutate calls', async () => {
    const stub = installFetch((url, init) => {
      if (url.includes('oauth2.googleapis.com/token'))
        return makeRes({ access_token: 'tok', expires_in: 3600 });
      if (url.includes('googleAds:search')) {
        const q = JSON.parse(init.body).query as string;
        if (q.includes('FROM campaign_budget'))
          return makeRes({ results: [{ campaignBudget: { resourceName: `customers/${CID}/campaignBudgets/333` } }] });
        if (q.includes('FROM campaign '))
          return makeRes({
            results: [
              {
                campaign: {
                  id: '111',
                  resourceName: `customers/${CID}/campaigns/111`,
                  campaignBudget: `customers/${CID}/campaignBudgets/333`,
                },
              },
            ],
          });
        if (q.includes('FROM ad_group_ad'))
          return makeRes({
            results: [{ adGroupAd: { resourceName: `customers/${CID}/adGroupAds/222~444`, ad: { id: '444' } } }],
          });
        if (q.includes('FROM ad_group '))
          return makeRes({ results: [{ adGroup: { id: '222', resourceName: `customers/${CID}/adGroups/222` } }] });
        return makeRes({ results: [] });
      }
      return makeRes({ results: [] }); // any :mutate — should NOT be reached
    });
    try {
      const client = new GoogleAdsLiveClient(config as any);
      const base = 'ConvoAds v1_google_ads_acct';
      const campaign = await client.ensureDisplayCampaign({ customerId: CID, name: base });
      expect(campaign.campaignResourceName).toBe(`customers/${CID}/campaigns/111`);
      const adGroup = await client.ensureDisplayAdGroup({
        customerId: CID,
        campaignResourceName: campaign.campaignResourceName,
        name: `${base} ad group`,
      });
      expect(adGroup.adGroupResourceName).toBe(`customers/${CID}/adGroups/222`);
      const ad = await client.ensureDisplayUploadAd({
        customerId: CID,
        adGroupResourceName: adGroup.adGroupResourceName,
        assetResourceName: `customers/${CID}/assets/9`,
        finalUrl: 'https://land.test',
        name: `${base} ad`,
      });
      expect(ad.adGroupAdResourceName).toBe(`customers/${CID}/adGroupAds/222~444`);
      // The whole point: reuse means NOTHING is created on a retry.
      expect(stub.calls.some((c) => c.url.includes(':mutate'))).toBe(false);
    } finally {
      stub.restore();
    }
  });

  it('CREATES with DETERMINISTIC names (no random suffix) when nothing exists', async () => {
    const bodies: Record<string, any> = {};
    const stub = installFetch((url, init) => {
      if (url.includes('oauth2.googleapis.com/token'))
        return makeRes({ access_token: 'tok', expires_in: 3600 });
      if (url.includes('googleAds:search')) return makeRes({ results: [] }); // nothing exists yet
      if (url.includes('campaignBudgets:mutate')) {
        bodies.budget = JSON.parse(init.body);
        return makeRes({ results: [{ resourceName: `customers/${CID}/campaignBudgets/333` }] });
      }
      if (url.includes('campaigns:mutate')) {
        bodies.campaign = JSON.parse(init.body);
        return makeRes({ results: [{ resourceName: `customers/${CID}/campaigns/111` }] });
      }
      if (url.includes('adGroupAds:mutate'))
        return makeRes({ results: [{ resourceName: `customers/${CID}/adGroupAds/222~444` }] });
      if (url.includes('adGroups:mutate')) {
        bodies.adGroup = JSON.parse(init.body);
        return makeRes({ results: [{ resourceName: `customers/${CID}/adGroups/222` }] });
      }
      return makeRes({ results: [] });
    });
    try {
      const client = new GoogleAdsLiveClient(config as any);
      const base = 'ConvoAds v1_google_ads_acct';
      const campaign = await client.ensureDisplayCampaign({ customerId: CID, name: base });
      const adGroup = await client.ensureDisplayAdGroup({
        customerId: CID,
        campaignResourceName: campaign.campaignResourceName,
        name: `${base} ad group`,
      });
      await client.ensureDisplayUploadAd({
        customerId: CID,
        adGroupResourceName: adGroup.adGroupResourceName,
        assetResourceName: `customers/${CID}/assets/9`,
        finalUrl: 'https://land.test',
        name: `${base} ad`,
      });
      // Deterministic names verbatim — no `· <random>` suffix that would defeat
      // query-before-create on the next attempt.
      expect(bodies.campaign.operations[0].create.name).toBe(base);
      expect(bodies.budget.operations[0].create.name).toBe(`${base} budget`);
      expect(bodies.adGroup.operations[0].create.name).toBe(`${base} ad group`);
    } finally {
      stub.restore();
    }
  });
});
