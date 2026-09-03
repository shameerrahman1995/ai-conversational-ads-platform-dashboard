import { describe, it, expect } from 'vitest';
import { normalizeField, computeLeadScore } from '../src/modules/lead/lead-scoring';

describe('normalizeField', () => {
  it('lowercases + trims email', () => expect(normalizeField('email', 'A@B.com ')).toBe('a@b.com'));
  it('strips phone to digits/+', () =>
    expect(normalizeField('phone', '+1 (555) 123-4567')).toBe('+15551234567'));
  it('trims other fields', () => expect(normalizeField('fullName', ' Ada ')).toBe('Ada'));
});

describe('computeLeadScore', () => {
  it('scores low with no fields', () => {
    expect(computeLeadScore({ fields: {}, qualificationLevel: 'low' })).toBe(5);
  });
  it('rewards completeness + qualification, capped at 100', () => {
    expect(
      computeLeadScore({
        fields: { email: 'a', phone: 'b', company: 'c', fullName: 'd' },
        qualificationLevel: 'high',
      }),
    ).toBe(100);
  });
});
