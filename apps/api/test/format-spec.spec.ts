import { describe, it, expect } from 'vitest';
import { validateOutputs } from '../src/modules/creative/format-spec';

describe('validateOutputs', () => {
  it('passes correct image outputs', () => {
    const r = validateOutputs([
      { format: 'image_1_1', width: 1080, height: 1080, bytes: 100_000, storageKey: 'k' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('flags wrong dimensions', () => {
    const r = validateOutputs([
      { format: 'image_1_1', width: 800, height: 600, bytes: 100_000, storageKey: 'k' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'bad_width')).toBe(true);
  });

  it('flags an html5 bundle over 600KB (Google limit)', () => {
    const r = validateOutputs([{ format: 'html5', bytes: 700_000, storageKey: 'k' }]);
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe('oversize');
  });

  it('flags an unknown format', () => {
    const r = validateOutputs([{ format: 'weird', bytes: 1, storageKey: 'k' }]);
    expect(r.issues[0].code).toBe('unknown_format');
  });
});
