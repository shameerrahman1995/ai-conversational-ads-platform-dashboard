import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GenerateAdaptiveDto, BundleCopyDto } from '../src/modules/creative/dto';
import { SubmitLeadDto } from '../src/modules/agent-runtime/edge/dto';
import { SpendQueryDto, AttributionQueryDto, ImportSpendDto } from '../src/modules/analytics/dto';
import { QueryDto } from '../src/modules/knowledge/dto';
import { InviteUserDto } from '../src/modules/identity/dto';
import { RegisterSourceDto } from '../src/modules/ingestion/dto';

/**
 * Regression coverage for the confirmed input-validation audit findings. Each
 * DTO is exercised through class-validator exactly as the global ValidationPipe
 * runs it, asserting the newly-bounded fields reject abuse but keep valid input.
 */
async function erroredProps(Dto: new () => object, plain: Record<string, unknown>): Promise<Set<string>> {
  const instance = plainToInstance(Dto, plain);
  const errors = await validate(instance as object);
  return new Set(errors.map((e) => e.property));
}

describe('input-validation regressions', () => {
  describe('GenerateAdaptiveDto.formats (unbounded image-gen)', () => {
    it('accepts a small list of known formats', async () => {
      const bad = await erroredProps(GenerateAdaptiveDto, { formats: ['image_1_1', 'image_9_16'] });
      expect(bad.has('formats')).toBe(false);
    });

    it('rejects more than 12 formats', async () => {
      const bad = await erroredProps(GenerateAdaptiveDto, { formats: Array(13).fill('image_1_1') });
      expect(bad.has('formats')).toBe(true);
    });

    it('rejects unknown / non-string formats', async () => {
      expect((await erroredProps(GenerateAdaptiveDto, { formats: ['image_1_1', 'evil_format'] })).has('formats')).toBe(true);
      expect((await erroredProps(GenerateAdaptiveDto, { formats: [42] })).has('formats')).toBe(true);
    });
  });

  describe('BundleCopyDto.finalUrl / privacyUrl (javascript: URI in served ad)', () => {
    const base = { productName: 'Acme', hook: 'Buy now' };

    it('rejects a javascript: pseudo-URL', async () => {
      const bad = await erroredProps(BundleCopyDto, { ...base, finalUrl: 'javascript:alert(1)' });
      expect(bad.has('finalUrl')).toBe(true);
    });

    it('accepts an https finalUrl and optional https privacyUrl', async () => {
      const bad = await erroredProps(BundleCopyDto, {
        ...base,
        finalUrl: 'https://example.com/landing',
        privacyUrl: 'https://example.com/privacy',
      });
      expect(bad.has('finalUrl')).toBe(false);
      expect(bad.has('privacyUrl')).toBe(false);
    });

    it('rejects a javascript: privacyUrl but allows it to be omitted', async () => {
      expect((await erroredProps(BundleCopyDto, { ...base, finalUrl: 'https://x.com', privacyUrl: 'javascript:1' })).has('privacyUrl')).toBe(true);
      expect((await erroredProps(BundleCopyDto, { ...base, finalUrl: 'https://x.com' })).has('privacyUrl')).toBe(false);
    });
  });

  describe('SubmitLeadDto.fields (public lead-field abuse)', () => {
    it('accepts a small dynamic-key record', async () => {
      const bad = await erroredProps(SubmitLeadDto, {
        fields: { email: 'a@b.com', customQ1: 'yes' },
        consent: true,
      });
      expect(bad.has('fields')).toBe(false);
    });

    it('rejects more than 30 keys', async () => {
      const fields: Record<string, string> = {};
      for (let i = 0; i < 31; i++) fields[`k${i}`] = 'v';
      expect((await erroredProps(SubmitLeadDto, { fields, consent: true })).has('fields')).toBe(true);
    });

    it('rejects an oversized value or key', async () => {
      expect((await erroredProps(SubmitLeadDto, { fields: { a: 'x'.repeat(1025) }, consent: true })).has('fields')).toBe(true);
      expect((await erroredProps(SubmitLeadDto, { fields: { ['k'.repeat(65)]: 'v' }, consent: true })).has('fields')).toBe(true);
    });

    it('rejects a non-string value and an array', async () => {
      expect((await erroredProps(SubmitLeadDto, { fields: { a: 123 as unknown as string }, consent: true })).has('fields')).toBe(true);
      expect((await erroredProps(SubmitLeadDto, { fields: ['x'] as unknown as Record<string, string>, consent: true })).has('fields')).toBe(true);
    });
  });

  describe('analytics date queries (bad-date -> 400 not 500)', () => {
    it('accepts YYYY-MM-DD or omitted dates', async () => {
      expect((await erroredProps(SpendQueryDto, { since: '2026-09-01', until: '2026-09-30' })).size).toBe(0);
      expect((await erroredProps(SpendQueryDto, {})).size).toBe(0);
      expect((await erroredProps(AttributionQueryDto, { since: '2026-09-01' })).size).toBe(0);
    });

    it('rejects a malformed date on spend + attribution + import', async () => {
      expect((await erroredProps(SpendQueryDto, { since: 'not-a-date' })).has('since')).toBe(true);
      expect((await erroredProps(AttributionQueryDto, { until: 'garbage' })).has('until')).toBe(true);
      expect((await erroredProps(ImportSpendDto, { provider: 'google_ads', accountId: 'a', since: 'nope', until: '2026-09-30' })).has('since')).toBe(true);
    });
  });

  describe('QueryDto.k (LIMIT k*4 bound)', () => {
    it('accepts k within 1..20', async () => {
      expect((await erroredProps(QueryDto, { query: 'hi', k: 5 })).has('k')).toBe(false);
    });
    it('rejects k below 1 or above 20', async () => {
      expect((await erroredProps(QueryDto, { query: 'hi', k: 0 })).has('k')).toBe(true);
      expect((await erroredProps(QueryDto, { query: 'hi', k: 21 })).has('k')).toBe(true);
    });
  });

  describe('InviteUserDto.email', () => {
    it('rejects a non-email and accepts a real address', async () => {
      expect((await erroredProps(InviteUserDto, { email: 'not-an-email', role: 'creator' })).has('email')).toBe(true);
      expect((await erroredProps(InviteUserDto, { email: 'person@acme.com', role: 'creator' })).has('email')).toBe(false);
    });
  });

  describe('RegisterSourceDto.uri', () => {
    it('rejects a javascript: uri and accepts https', async () => {
      expect((await erroredProps(RegisterSourceDto, { type: 'url', uri: 'javascript:alert(1)' })).has('uri')).toBe(true);
      expect((await erroredProps(RegisterSourceDto, { type: 'url', uri: 'https://example.com/feed' })).has('uri')).toBe(false);
    });
  });
});
