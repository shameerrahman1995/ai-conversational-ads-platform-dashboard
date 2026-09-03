/**
 * @acp/connectors
 * The uniform advertising-platform connector contract (blueprint §14).
 *
 * Every provider adapter (Google Ads, Meta, TikTok, Microsoft, Amazon DSP,
 * LinkedIn, generic export) implements `AdConnector`. Each exposes a
 * capabilities document by account/objective/region/placement so the UI only
 * ever promises formats the connected account can actually use.
 */
import type { AdPlatform, ConnectorStatus, CreativeFormat } from '@acp/shared-types';

// ---- Capabilities ----
export interface ConnectorCapabilities {
  platform: AdPlatform;
  accountId: string;
  objectives: string[];
  regions: string[];
  placements: string[];
  supportedFormats: CreativeFormat[];
  supportsNativeLeadForms: boolean;
  supportsHtml5: boolean;
  /** e.g. Google display upload bundle limit of 600 KB. */
  maxBundleBytes?: number;
  notes?: string;
}

// ---- Accounts / auth ----
export interface AdAccountRef {
  accountId: string;
  name: string;
  currency?: string;
  status: ConnectorStatus;
}

export interface AuthorizeResult {
  status: ConnectorStatus;
  /** Reference into the secrets manager; never a raw token. */
  secretRef: string;
  scopes: string[];
  expiresAt?: string;
}

// ---- Assets, drafts, publishing ----
export interface UploadAssetInput {
  variantId: string;
  format: CreativeFormat;
  /** Signed URL or storage key; connectors fetch server-side. */
  assetRef: string;
  checksum: string;
}

export interface UploadAssetResult {
  assetRef: string;
  remoteAssetId: string;
}

export interface CreateDraftInput {
  accountId: string;
  campaignSpec: unknown; // provider-agnostic spec; validated by validate()
  idempotencyKey: string;
}

export interface RemoteObjectMap {
  provider: AdPlatform;
  accountId: string;
  campaignId?: string;
  adGroupId?: string;
  adId?: string;
  revision: number;
  reviewStatus?: string;
  lastSyncCursor?: string;
}

export interface PublishInput {
  draftRemoteId: string;
  /** Immutable snapshot approved in the UI (blueprint §8 publishing safety). */
  snapshotId: string;
  idempotencyKey: string;
}

export interface ReviewStatus {
  remoteId: string;
  state: string; // provider-specific, normalized upstream
  reason?: string;
  updatedAt: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

// ---- Metrics & leads ----
export interface MetricsQuery {
  accountId: string;
  since: string;
  until: string;
}

export interface MetricsRow {
  remoteId: string;
  impressions: number;
  clicks: number;
  spend: number;
  currency: string;
  date: string;
}

export interface RemoteLead {
  remoteLeadId: string;
  fields: Record<string, string>;
  createdAt: string;
}

/**
 * The 12-method connector contract. Implementations live in
 * `packages/connectors/src/adapters/<provider>` (added in Phase 2).
 */
export interface AdConnector {
  readonly platform: AdPlatform;

  authorize(input: { orgId: string; code?: string }): Promise<AuthorizeResult>;
  listAccounts(input: { secretRef: string }): Promise<AdAccountRef[]>;
  capabilities(input: { accountId: string; secretRef: string }): Promise<ConnectorCapabilities>;
  validate(input: CreateDraftInput): Promise<ValidationResult>;
  uploadAssets(input: {
    secretRef: string;
    assets: UploadAssetInput[];
  }): Promise<UploadAssetResult[]>;
  createDraft(input: CreateDraftInput & { secretRef: string }): Promise<RemoteObjectMap>;
  publish(input: PublishInput & { secretRef: string }): Promise<RemoteObjectMap>;
  getReviewStatus(input: { remoteId: string; secretRef: string }): Promise<ReviewStatus>;
  pause(input: { remoteId: string; secretRef: string }): Promise<void>;
  fetchMetrics(input: MetricsQuery & { secretRef: string }): Promise<MetricsRow[]>;
  fetchLeads(input: { accountId: string; secretRef: string; since: string }): Promise<RemoteLead[]>;
  revoke(input: { secretRef: string }): Promise<void>;
}

/** MVP connector rollout order (blueprint §14 / roadmap). */
export const CONNECTOR_ROLLOUT: AdPlatform[] = [
  'generic_export',
  'google_ads',
  'meta',
  'tiktok',
  'microsoft',
  'amazon_dsp',
  'linkedin',
];
