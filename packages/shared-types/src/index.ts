/**
 * @acp/shared-types
 * Single source of truth for cross-cutting domain types, lifecycle state machines,
 * roles and enumerations used by web, api and workers.
 */

// ---- Tenancy & access ----

/** Roles per blueprint §3 "Global navigation rules" / §17 tenant security. */
export type UserRole = 'creator' | 'reviewer' | 'publisher' | 'analyst' | 'admin';

export type OrgPlan = 'trial' | 'starter' | 'growth' | 'enterprise';

export type UserStatus = 'invited' | 'active' | 'suspended';

// ---- Campaign lifecycle (blueprint §8) ----
// DRAFT -> GENERATED -> VALIDATION_FAILED | READY_FOR_REVIEW -> APPROVED ->
// SCHEDULED -> PUBLISHING -> IN_REVIEW -> LIVE -> PAUSED | REJECTED | ARCHIVED
export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'GENERATED',
  'VALIDATION_FAILED',
  'READY_FOR_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'IN_REVIEW',
  'LIVE',
  'PAUSED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Allowed forward transitions for the campaign lifecycle. */
export const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  DRAFT: ['GENERATED', 'ARCHIVED'],
  GENERATED: ['VALIDATION_FAILED', 'READY_FOR_REVIEW', 'ARCHIVED'],
  VALIDATION_FAILED: ['GENERATED', 'ARCHIVED'],
  READY_FOR_REVIEW: ['APPROVED', 'REJECTED', 'ARCHIVED'],
  APPROVED: ['SCHEDULED', 'PUBLISHING', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHING', 'ARCHIVED'],
  PUBLISHING: ['IN_REVIEW', 'REJECTED'],
  IN_REVIEW: ['LIVE', 'REJECTED'],
  LIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['LIVE', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

// ---- Connector lifecycle (blueprint §8) ----
// DISCONNECTED -> AUTHORIZING -> CONNECTED -> DEGRADED -> REAUTH_REQUIRED -> REVOKED
export const CONNECTOR_STATUSES = [
  'DISCONNECTED',
  'AUTHORIZING',
  'CONNECTED',
  'DEGRADED',
  'REAUTH_REQUIRED',
  'REVOKED',
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

/** Allowed forward transitions for the connector lifecycle (blueprint §8). */
export const CONNECTOR_TRANSITIONS: Readonly<Record<ConnectorStatus, readonly ConnectorStatus[]>> = {
  DISCONNECTED: ['AUTHORIZING'],
  AUTHORIZING: ['CONNECTED', 'DISCONNECTED'],
  CONNECTED: ['DEGRADED', 'REAUTH_REQUIRED', 'REVOKED'],
  DEGRADED: ['CONNECTED', 'REAUTH_REQUIRED', 'REVOKED'],
  REAUTH_REQUIRED: ['AUTHORIZING', 'CONNECTED', 'REVOKED'],
  REVOKED: ['AUTHORIZING', 'DISCONNECTED'],
};

export function canTransitionConnector(from: ConnectorStatus, to: ConnectorStatus): boolean {
  return CONNECTOR_TRANSITIONS[from].includes(to);
}

// ---- Approvals & versioning ----
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// ---- Ad platforms & CRM providers ----
export type AdPlatform =
  | 'google_ads'
  | 'meta'
  | 'tiktok'
  | 'microsoft'
  | 'amazon_dsp'
  | 'linkedin'
  | 'generic_export';

export type CrmProvider = 'hubspot' | 'salesforce' | 'zoho' | 'webhook';

export type CalendarProvider = 'google_calendar' | 'microsoft_365';

// ---- Creative formats ----
export type CreativeFormat =
  | 'image_1_1'
  | 'image_4_5'
  | 'image_9_16'
  | 'video'
  | 'carousel'
  | 'html5'
  | 'native_form_schema';

// ---- Consent (kept as separate records per blueprint §15) ----
export type ConsentType =
  | 'ad_platform'
  | 'ai_disclosure'
  | 'marketing'
  | 'call_recording';

// ---- Lead qualification ----
export type QualificationLevel = 'low' | 'medium' | 'high';

export type LeadDeliveryState =
  | 'captured'
  | 'validated'
  | 'assigned'
  | 'sent_to_crm'
  | 'accepted'
  | 'stage_changed'
  | 'failed';

/** Field-level provenance for lead data (blueprint §7 lead record design). */
export type FieldSource = 'platform_form' | 'user_message' | 'enrichment' | 'crm';

// ---- Common shapes ----
export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

/** Branded ID helper to avoid mixing entity ids at the type level. */
export type Id<Brand extends string> = string & { readonly __brand: Brand };
export type OrgId = Id<'org'>;
export type UserId = Id<'user'>;
export type CampaignId = Id<'campaign'>;
export type LeadId = Id<'lead'>;

// ---- RBAC ----

/** RBAC check: admin is a superuser; otherwise the role must be in `allowed`. */
export function roleSatisfies(userRole: UserRole, allowed: UserRole[]): boolean {
  return userRole === 'admin' || allowed.includes(userRole);
}
