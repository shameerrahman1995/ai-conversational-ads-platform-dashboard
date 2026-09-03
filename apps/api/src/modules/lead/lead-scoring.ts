import type { QualificationLevel } from '@acp/shared-types';

export function normalizeField(field: string, value: string): string {
  if (field === 'email') return value.trim().toLowerCase();
  if (field === 'phone') return value.replace(/[^\d+]/g, '');
  return value.trim();
}

export interface LeadFields {
  email?: string;
  phone?: string;
  fullName?: string;
  company?: string;
}

export interface ScoreInput {
  fields: LeadFields;
  qualificationLevel?: QualificationLevel;
}

/** Deterministic 0-100 lead score from field completeness + qualification. */
export function computeLeadScore(input: ScoreInput): number {
  let s = 0;
  if (input.fields.email) s += 25;
  if (input.fields.phone) s += 20;
  if (input.fields.company) s += 15;
  if (input.fields.fullName) s += 10;
  s += input.qualificationLevel === 'high' ? 30 : input.qualificationLevel === 'medium' ? 15 : 5;
  return Math.min(100, s);
}
