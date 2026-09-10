import { Injectable } from '@nestjs/common';
import type {
  AdAccountRef,
  AdConnector,
  AuthorizeResult,
  ConnectorCapabilities,
  CreateDraftInput,
  MetricsQuery,
  MetricsRow,
  PublishInput,
  RemoteLead,
  RemoteObjectMap,
  ReviewStatus,
  UploadAssetInput,
  UploadAssetResult,
  ValidationResult,
} from '@acp/connectors';
import type { AdPlatform, CreativeFormat } from '@acp/shared-types';
import {
  GoogleAdsLiveClient,
  normalizeCustomerId,
  readGoogleAdsConfig,
} from './google-ads.live';

/**
 * DEV STUB ad-connector adapters (blueprint §14). They implement the full
 * 12-method AdConnector contract deterministically so the publish control plane
 * is testable without real OAuth/API access. Real Google Ads / Meta API calls
 * swap in behind this contract without changing the control plane.
 */
export abstract class BaseAdConnectorStub implements AdConnector {
  abstract readonly platform: AdPlatform;
  protected formats: CreativeFormat[] = ['image_1_1', 'image_4_5', 'image_9_16', 'video'];
  protected html5 = false;
  protected nativeLeadForms = false;
  protected maxBundleBytes: number | undefined = undefined;

  async authorize(input: { orgId: string; code?: string }): Promise<AuthorizeResult> {
    return { status: 'CONNECTED', secretRef: `secret:${this.platform}:${input.orgId}`, scopes: [] };
  }

  async listAccounts(): Promise<AdAccountRef[]> {
    return [{ accountId: `${this.platform}-acct-1`, name: `${this.platform} account`, status: 'CONNECTED' }];
  }

  async capabilities(input: { accountId: string; secretRef: string }): Promise<ConnectorCapabilities> {
    return {
      platform: this.platform,
      accountId: input.accountId,
      objectives: ['leads', 'traffic'],
      regions: ['US', 'EU'],
      placements: ['feed'],
      supportedFormats: this.formats,
      supportsNativeLeadForms: this.nativeLeadForms,
      supportsHtml5: this.html5,
      maxBundleBytes: this.maxBundleBytes,
    };
  }

  async validate(_input: CreateDraftInput): Promise<ValidationResult> {
    return { ok: true, issues: [] };
  }

  async uploadAssets(input: {
    secretRef: string;
    assets: UploadAssetInput[];
  }): Promise<UploadAssetResult[]> {
    return input.assets.map((a) => ({
      assetRef: a.assetRef,
      remoteAssetId: `${this.platform}-asset-${a.variantId}`,
    }));
  }

  async createDraft(input: CreateDraftInput & { secretRef: string }): Promise<RemoteObjectMap> {
    return {
      provider: this.platform,
      accountId: input.accountId,
      campaignId: `${this.platform}-draft-${input.idempotencyKey}`,
      revision: 1,
      reviewStatus: 'draft',
    };
  }

  async publish(input: PublishInput & { secretRef: string }): Promise<RemoteObjectMap> {
    return {
      provider: this.platform,
      accountId: `${this.platform}-acct-1`,
      campaignId: input.draftRemoteId,
      adId: `${this.platform}-ad-${input.snapshotId}`,
      revision: 1,
      reviewStatus: 'in_review',
    };
  }

  async getReviewStatus(input: { remoteId: string; secretRef: string }): Promise<ReviewStatus> {
    return { remoteId: input.remoteId, state: 'approved', updatedAt: new Date().toISOString() };
  }

  async pause(_input: { remoteId: string; secretRef: string }): Promise<void> {}
  async fetchMetrics(_input: MetricsQuery & { secretRef: string }): Promise<MetricsRow[]> {
    return [];
  }
  async fetchLeads(): Promise<RemoteLead[]> {
    return [];
  }
  async revoke(_input: { secretRef: string }): Promise<void> {}
}

/**
 * Google Ads connector. Runs the REAL Google Ads API (v25) when PROVIDERS_MODE=live
 * and the GOOGLE_ADS_* credentials are all present; otherwise it transparently
 * behaves as the deterministic stub above, so dev/test never call out.
 *
 * The live publishing unit is an HTML5 **display upload ad** (blueprint §6): the
 * compiled creative ZIP is uploaded as a MEDIA_BUNDLE asset, then a DisplayUploadAd
 * referencing it is created (PAUSED) inside a DISPLAY campaign → ad group; publish
 * enables the ad; pause/resume/review all act on the AD.
 *
 * Remote ids are packed as `customerId:adGroupAdResourceName` so the
 * review/pause/resume paths — which the control plane calls with only a remoteId —
 * can resolve both the operating account and the target ad without extra plumbing.
 */
@Injectable()
export class GoogleAdsConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'google_ads';
  protected formats: CreativeFormat[] = ['image_1_1', 'image_4_5', 'html5'];
  protected html5 = true;
  protected nativeLeadForms = true;
  protected maxBundleBytes = 600_000; // Google display bundle limit

  private client: GoogleAdsLiveClient | null | undefined; // undefined = not yet resolved

  /** The live client, or null when creds are absent (→ fall back to the stub). */
  private live(): GoogleAdsLiveClient | null {
    if (this.client === undefined) {
      const config = readGoogleAdsConfig();
      this.client = config ? new GoogleAdsLiveClient(config) : null;
    }
    return this.client;
  }

  private resolveCustomerId(accountId?: string): string {
    const cid = normalizeCustomerId(accountId) || readGoogleAdsConfig()?.defaultCustomerId || '';
    if (!cid) {
      throw new Error(
        'Google Ads: no operating customer id (set the plan accountId or GOOGLE_ADS_CUSTOMER_ID)',
      );
    }
    return cid;
  }

  /** Pack the operating account with the target ad's adGroupAd resource name. */
  private static pack(customerId: string, adResourceName: string): string {
    return `${customerId}:${adResourceName}`;
  }

  /**
   * Split a packed remote id back into the account + the ad's adGroupAd resource
   * name. The adGroupAd RN (`customers/{cid}/adGroupAds/{adGroupId}~{adId}`)
   * contains no ':' so a single split is unambiguous. Legacy/unpacked ids (no
   * ':') fall back to the default operating account.
   */
  private unpack(remoteId: string): { customerId: string; adResourceName: string } {
    const idx = remoteId.indexOf(':');
    return idx >= 0
      ? {
          customerId: normalizeCustomerId(remoteId.slice(0, idx)),
          adResourceName: remoteId.slice(idx + 1),
        }
      : { customerId: this.resolveCustomerId(), adResourceName: remoteId };
  }

  /** Numeric ad id from an adGroupAd resource name `.../adGroupAds/{adGroupId}~{adId}`. */
  private static adIdFrom(adResourceName: string): string {
    return adResourceName.split('~').pop() ?? '';
  }

  /** Best-effort creative name from the provider-agnostic creative spec. */
  private campaignName(spec: unknown, fallbackKey: string): string {
    const s = (spec ?? {}) as Record<string, unknown>;
    const copy = (s.copy ?? {}) as Record<string, unknown>;
    const name = s.name ?? s.headline ?? s.title ?? copy.headline ?? copy.title;
    return typeof name === 'string' && name.trim()
      ? `ConvoAds — ${name.trim()}`.slice(0, 120)
      : `ConvoAds campaign ${fallbackKey}`;
  }

  /**
   * Pull the display-upload inputs out of the provider-agnostic campaignSpec:
   * the MEDIA_BUNDLE asset resource name (from uploadAssets) and the ad's final
   * (landing) URL. The compiler/parent wires these onto the spec.
   */
  private readAdSpec(spec: unknown): { assetResourceName?: string; finalUrl?: string } {
    const s = (spec ?? {}) as Record<string, unknown>;
    const assetResourceName =
      typeof s.assetResourceName === 'string' ? s.assetResourceName : undefined;
    const finalUrlRaw = s.finalUrl ?? s.landingUrl;
    const finalUrl = typeof finalUrlRaw === 'string' ? finalUrlRaw : undefined;
    return { assetResourceName, finalUrl };
  }

  async authorize(input: { orgId: string; code?: string }): Promise<AuthorizeResult> {
    const client = this.live();
    if (!client) return super.authorize(input);
    // Prove the credentials actually work before reporting CONNECTED.
    await client.listAccessibleCustomerIds();
    return {
      status: 'CONNECTED',
      secretRef: `google_ads:live:${input.orgId}`,
      scopes: ['https://www.googleapis.com/auth/adwords'],
    };
  }

  async listAccounts(): Promise<AdAccountRef[]> {
    const client = this.live();
    if (!client) return super.listAccounts();
    const accounts = await client.listAccounts();
    return accounts.map((a) => ({
      accountId: a.customerId,
      name: a.isManager ? `${a.name} (manager)` : a.name,
      currency: a.currencyCode,
      status: 'CONNECTED' as const,
    }));
  }

  /**
   * Eligibility gate (blueprint §6). A manager (MCC) account cannot host ads —
   * a clear, reliable negative signal → block with GOOGLE_HTML5_NOT_ELIGIBLE.
   * Otherwise pass with a WARNING: Google exposes NO reliable API signal for
   * HTML5-upload allowlisting (a per-account allowlist it grants manually), so we
   * do NOT block on a probe we cannot validate — we surface it and let creation
   * report the definitive error if the account is not allowlisted.
   */
  async validate(input: CreateDraftInput): Promise<ValidationResult> {
    const client = this.live();
    if (!client) return super.validate(input);
    try {
      const customerId = this.resolveCustomerId(input.accountId);
      const probe = await client.probeDisplayEligibility(customerId);
      if (probe.isManager) {
        return {
          ok: false,
          issues: [
            {
              code: 'GOOGLE_HTML5_NOT_ELIGIBLE',
              message:
                'This is a manager (MCC) account, which cannot host display upload ads. ' +
                'Select a non-manager account that is allowlisted for HTML5 upload ads.',
              severity: 'error',
            },
          ],
        };
      }
      // TODO(eligibility): no Google Ads API field exposes HTML5-upload
      // allowlisting; it is granted per-account by Google. Warn rather than block.
      return {
        ok: true,
        issues: [
          {
            code: 'GOOGLE_HTML5_ELIGIBILITY_UNVERIFIED',
            message:
              'HTML5 display upload ads require the account to be allowlisted by Google, ' +
              'which cannot be verified via the API. If ad creation fails with an eligibility ' +
              'error, request allowlisting for this account.',
            severity: 'warning',
          },
        ],
      };
    } catch (err) {
      // Never block publishing on a probe we could not run.
      return {
        ok: true,
        issues: [
          {
            code: 'GOOGLE_HTML5_ELIGIBILITY_UNVERIFIED',
            message: `Could not probe display eligibility: ${(err as Error).message}`,
            severity: 'warning',
          },
        ],
      };
    }
  }

  /**
   * Upload the compiled HTML5 creative ZIP as a MEDIA_BUNDLE asset (call #1).
   * The bytes arrive as an optional base64 `bundleBase64` field on the first
   * asset (wired by the compiler/parent); with no bytes we throw rather than
   * fabricate a remote id. uploadAssets has no accountId, so it targets the
   * default operating customer.
   */
  async uploadAssets(input: {
    secretRef: string;
    assets: UploadAssetInput[];
  }): Promise<UploadAssetResult[]> {
    const client = this.live();
    if (!client) return super.uploadAssets(input);
    const first = input.assets[0];
    if (!first) return [];
    const zipBase64 = (first as UploadAssetInput & { bundleBase64?: string }).bundleBase64;
    if (!zipBase64) {
      throw new Error(
        'Google Ads: no media bundle bytes (expected assets[0].bundleBase64 with the HTML5 ZIP)',
      );
    }
    const customerId = this.resolveCustomerId();
    const assetResourceName = await client.uploadMediaBundleAsset({ customerId, zipBase64 });
    return [{ assetRef: first.assetRef, remoteAssetId: assetResourceName }];
  }

  async createDraft(input: CreateDraftInput & { secretRef: string }): Promise<RemoteObjectMap> {
    const client = this.live();
    if (!client) return super.createDraft(input);
    const customerId = this.resolveCustomerId(input.accountId);
    const { assetResourceName, finalUrl } = this.readAdSpec(input.campaignSpec);
    if (!assetResourceName) {
      throw new Error(
        'Google Ads: createDraft requires campaignSpec.assetResourceName (upload the HTML5 media bundle first)',
      );
    }
    if (!finalUrl) {
      throw new Error(
        'Google Ads: createDraft requires campaignSpec.finalUrl (or campaignSpec.landingUrl)',
      );
    }
    const name = this.campaignName(input.campaignSpec, input.idempotencyKey);
    // Calls #2 (campaign + ad group) then #3 (the display upload ad, PAUSED).
    const campaign = await client.ensureDisplayCampaign({ customerId, name });
    const adGroup = await client.ensureDisplayAdGroup({
      customerId,
      campaignResourceName: campaign.campaignResourceName,
      name,
    });
    const ad = await client.createDisplayUploadAd({
      customerId,
      adGroupResourceName: adGroup.adGroupResourceName,
      assetResourceName,
      finalUrl,
      name,
    });
    const packed = GoogleAdsConnector.pack(customerId, ad.adGroupAdResourceName);
    return {
      provider: this.platform,
      accountId: customerId,
      // The packed AD id travels via campaignId (executePublish passes
      // draft.campaignId to publish as draftRemoteId) and adId (the tracked
      // remote id for review/pause/resume).
      campaignId: packed,
      adGroupId: adGroup.adGroupId,
      adId: packed,
      revision: 1,
      reviewStatus: 'draft',
    };
  }

  async publish(input: PublishInput & { secretRef: string }): Promise<RemoteObjectMap> {
    const client = this.live();
    if (!client) return super.publish(input);
    const { customerId, adResourceName } = this.unpack(input.draftRemoteId);
    // Enabling the ad submits it to Google's policy/review pipeline (call #4).
    await client.setAdGroupAdStatus(customerId, adResourceName, 'ENABLED');
    const packed = GoogleAdsConnector.pack(customerId, adResourceName);
    return {
      provider: this.platform,
      accountId: customerId,
      campaignId: packed,
      adId: packed,
      revision: 1,
      reviewStatus: 'in_review',
    };
  }

  async getReviewStatus(input: { remoteId: string; secretRef: string }): Promise<ReviewStatus> {
    const client = this.live();
    if (!client) return super.getReviewStatus(input);
    const { customerId, adResourceName } = this.unpack(input.remoteId);
    const signal = await client.getAdReviewStatus(
      customerId,
      GoogleAdsConnector.adIdFrom(adResourceName),
    );
    if (!signal) {
      return {
        remoteId: input.remoteId,
        state: 'in_review',
        reason: 'Ad not found',
        updatedAt: new Date().toISOString(),
      };
    }
    // Map the ad_group_ad policy approval to the connector's review states.
    const approval = signal.approvalStatus;
    const state =
      approval === 'DISAPPROVED'
        ? 'rejected'
        : approval === 'APPROVED' ||
            approval === 'APPROVED_LIMITED' ||
            approval === 'AREA_OF_INTEREST_ONLY'
          ? 'approved'
          : 'in_review';
    return {
      remoteId: input.remoteId,
      state,
      reason:
        state === 'rejected'
          ? `Ad disapproved (review: ${signal.reviewStatus ?? 'unknown'})`
          : undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  async pause(input: { remoteId: string; secretRef: string }): Promise<void> {
    const client = this.live();
    if (!client) return super.pause(input);
    const { customerId, adResourceName } = this.unpack(input.remoteId);
    await client.setAdGroupAdStatus(customerId, adResourceName, 'PAUSED');
  }

  /** Counterpart to pause — re-enable a paused ad (called by publish.resume). */
  async resume(input: { remoteId: string; secretRef: string }): Promise<void> {
    const client = this.live();
    if (!client) return;
    const { customerId, adResourceName } = this.unpack(input.remoteId);
    await client.setAdGroupAdStatus(customerId, adResourceName, 'ENABLED');
  }

  async fetchMetrics(input: MetricsQuery & { secretRef: string }): Promise<MetricsRow[]> {
    const client = this.live();
    if (!client) return super.fetchMetrics(input);
    const customerId = this.resolveCustomerId(input.accountId);
    const rows = await client.fetchMetrics(customerId, input.since, input.until);
    return rows.map((r) => ({
      remoteId: GoogleAdsConnector.pack(customerId, r.campaignId),
      impressions: r.impressions,
      clicks: r.clicks,
      spend: r.costMicros / 1_000_000,
      currency: r.currencyCode,
      date: r.date,
    }));
  }

  async revoke(input: { secretRef: string }): Promise<void> {
    const client = this.live();
    if (!client) return super.revoke(input);
    await client.revoke();
  }
}

@Injectable()
export class MetaConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'meta';
  protected formats: CreativeFormat[] = ['image_1_1', 'image_4_5', 'image_9_16', 'video', 'carousel'];
  protected nativeLeadForms = true;
}

@Injectable()
export class GenericExportConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'generic_export';
  protected formats: CreativeFormat[] = [
    'image_1_1',
    'image_4_5',
    'image_9_16',
    'video',
    'html5',
  ];
  protected html5 = true;
}

// ---- Phase 4 expansion connectors (blueprint §14) ----

@Injectable()
export class TikTokConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'tiktok';
  protected formats: CreativeFormat[] = ['video', 'image_9_16'];
  protected nativeLeadForms = true; // TikTok lead generation
}

@Injectable()
export class MicrosoftConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'microsoft';
  protected formats: CreativeFormat[] = ['image_1_1', 'image_4_5', 'html5'];
  protected html5 = true;
}

@Injectable()
export class AmazonDspConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'amazon_dsp';
  protected formats: CreativeFormat[] = ['image_1_1', 'video', 'html5'];
  protected html5 = true;
}

@Injectable()
export class LinkedInConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'linkedin';
  protected formats: CreativeFormat[] = ['image_1_1', 'video', 'native_form_schema'];
  protected nativeLeadForms = true; // LinkedIn Lead Gen Forms
}
