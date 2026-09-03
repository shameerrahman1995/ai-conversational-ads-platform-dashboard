/**
 * @acp/crm
 * Canonical lead schema (blueprint §15) that every CRM/calendar adapter maps to,
 * plus the adapter contract. Build the canonical model first so each destination
 * maps to a stable internal shape.
 */
import { z } from 'zod';
import type { ConsentType, CrmProvider, FieldSource, QualificationLevel } from '@acp/shared-types';

// A single field carries its provenance (blueprint §7 lead record design).
export const sourcedFieldSchema = z.object({
  value: z.string(),
  source: z.custom<FieldSource>(),
});
export type SourcedField = z.infer<typeof sourcedFieldSchema>;

export const consentRecordSchema = z.object({
  type: z.custom<ConsentType>(),
  granted: z.boolean(),
  disclosureVersion: z.string(),
  timestamp: z.string(), // ISO-8601
});
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export const canonicalLeadSchema = z.object({
  // Identity (field-level source)
  contact: z.object({
    fullName: sourcedFieldSchema.optional(),
    email: sourcedFieldSchema.optional(),
    phone: sourcedFieldSchema.optional(),
  }),
  company: z
    .object({
      name: sourcedFieldSchema.optional(),
      size: sourcedFieldSchema.optional(),
    })
    .optional(),

  // Interest & qualification (facts kept separate from model summary)
  interest: z.string().optional(),
  qualificationLevel: z.custom<QualificationLevel>().optional(),
  qualificationFacts: z.array(z.string()).default([]),
  agentSummary: z.string().optional(),

  // Provenance & attribution
  source: z.object({
    campaignId: z.string(),
    creativeVariantId: z.string().optional(),
    agentVersion: z.string().optional(),
    landingSessionId: z.string().optional(),
  }),
  consent: z.array(consentRecordSchema).default([]),

  // Ownership & lifecycle
  ownerId: z.string().optional(),
  lifecycleStage: z.string().optional(),
});
export type CanonicalLead = z.infer<typeof canonicalLeadSchema>;

// ---- Field mapping (per org + destination object) ----
export interface FieldMapping {
  /** dot-path into CanonicalLead, e.g. "contact.email.value" */
  from: string;
  /** destination object field id in the CRM */
  to: string;
  required: boolean;
  transform?: 'lowercase' | 'e164' | 'none';
}

export interface DeliveryResult {
  ok: boolean;
  remoteId?: string;
  error?: { code: string; message: string; field?: string };
}

/** CRM adapter contract. Adapters: hubspot, salesforce, zoho, webhook. */
export interface CrmAdapter {
  readonly provider: CrmProvider;

  /** Validate a mapping against the destination object's schema + write perms. */
  validateMapping(input: {
    secretRef: string;
    mappings: FieldMapping[];
  }): Promise<{ ok: boolean; issues: string[] }>;

  /** Create or update a lead. Must be idempotent on `idempotencyKey`. */
  upsertLead(input: {
    secretRef: string;
    lead: CanonicalLead;
    mappings: FieldMapping[];
    idempotencyKey: string;
  }): Promise<DeliveryResult>;

  /** Pull stage/revenue feedback to match against original lead (blueprint §15). */
  fetchStageChanges(input: {
    secretRef: string;
    since: string;
  }): Promise<Array<{ remoteId: string; stage: string; revenue?: number; at: string }>>;
}
