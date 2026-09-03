import { describe, it, expect } from 'vitest';
import { runPolicyPacks, getVerticalPack, RESTRICTED_VERTICALS } from '@acp/policy';
import { PolicyService, extractCopy } from '../src/modules/policy/policy.service';

describe('@acp/policy vertical packs', () => {
  it('is a no-op for a non-restricted vertical', () => {
    const r = runPolicyPacks({ vertical: 'ecommerce', text: 'Buy now, best deal ever' });
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('has a pack for every restricted vertical', () => {
    for (const v of RESTRICTED_VERTICALS) {
      expect(getVerticalPack(v)?.vertical).toBe(v);
    }
  });

  it('blocks healthcare copy missing mandatory disclaimers', () => {
    const r = runPolicyPacks({ vertical: 'healthcare', text: 'Our supplement helps you feel better.' });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === 'missing_disclaimer' && f.severity === 'block')).toBe(true);
    expect(r.findings.some((f) => f.code === 'restricted_vertical')).toBe(true);
  });

  it('blocks a prohibited claim even when disclaimers are present', () => {
    const r = runPolicyPacks({
      vertical: 'healthcare',
      text: 'Results may vary. Consult a doctor. This is a miracle cure!',
    });
    expect(r.ok).toBe(false);
    expect(r.findings.filter((f) => f.code === 'prohibited_term').length).toBeGreaterThanOrEqual(1);
  });

  it('passes finance copy that carries the required disclaimer and no banned claims', () => {
    const r = runPolicyPacks({ vertical: 'finance', text: 'Grow your savings. Terms apply.' });
    expect(r.ok).toBe(true);
    // still marked restricted (human review required) but not blocking
    expect(r.findings.every((f) => f.severity !== 'block')).toBe(true);
    expect(r.findings.some((f) => f.requiresHumanReview)).toBe(true);
  });

  it('blocks fair-housing violations', () => {
    const r = runPolicyPacks({ vertical: 'housing', text: 'Great apartment, adults only, no children.' });
    expect(r.ok).toBe(false);
    expect(r.findings.filter((f) => f.code === 'prohibited_term').length).toBeGreaterThanOrEqual(2);
  });
});

describe('PolicyService', () => {
  it('extractCopy flattens nested spec strings', () => {
    const text = extractCopy({ headline: 'Win big', body: { offer: 'risk-free returns', cta: 'Sign up' } });
    expect(text).toContain('Win big');
    expect(text).toContain('risk-free returns');
    expect(text).toContain('Sign up');
  });

  it('evaluateCampaignCopy blocks a finance spec with a prohibited claim', () => {
    const svc = new PolicyService();
    const r = svc.evaluateCampaignCopy({
      vertical: 'finance',
      spec: { headline: 'Guaranteed returns, risk-free!', body: 'Terms apply' },
    });
    expect(r.ok).toBe(false);
    expect(svc.blockingReasons(r).length).toBeGreaterThan(0);
  });
});
