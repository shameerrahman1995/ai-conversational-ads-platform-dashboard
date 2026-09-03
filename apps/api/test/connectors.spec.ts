import { describe, it, expect } from 'vitest';
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

describe('ad connector stubs', () => {
  it('google exposes HTML5 + the 600KB bundle limit', async () => {
    const caps = await new GoogleAdsConnector().capabilities({ accountId: 'a', secretRef: '' });
    expect(caps.platform).toBe('google_ads');
    expect(caps.supportsHtml5).toBe(true);
    expect(caps.maxBundleBytes).toBe(600_000);
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
