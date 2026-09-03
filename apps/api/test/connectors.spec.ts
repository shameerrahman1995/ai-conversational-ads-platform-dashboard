import { describe, it, expect } from 'vitest';
import {
  GenericExportConnector,
  GoogleAdsConnector,
  MetaConnector,
} from '../src/modules/publishing/connectors/adapters';

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
});
