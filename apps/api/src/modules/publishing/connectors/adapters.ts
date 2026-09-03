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

  async pause(): Promise<void> {}
  async fetchMetrics(_input: MetricsQuery & { secretRef: string }): Promise<MetricsRow[]> {
    return [];
  }
  async fetchLeads(): Promise<RemoteLead[]> {
    return [];
  }
  async revoke(): Promise<void> {}
}

@Injectable()
export class GoogleAdsConnector extends BaseAdConnectorStub {
  readonly platform: AdPlatform = 'google_ads';
  protected formats: CreativeFormat[] = ['image_1_1', 'image_4_5', 'html5'];
  protected html5 = true;
  protected nativeLeadForms = true;
  protected maxBundleBytes = 600_000; // Google display bundle limit
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
