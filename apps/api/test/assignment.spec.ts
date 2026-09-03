import { describe, it, expect } from 'vitest';
import { pickArm } from '../src/modules/experiments/assignment';

const arms = [
  { key: 'A', weight: 1 },
  { key: 'B', weight: 1 },
];

describe('pickArm', () => {
  it('is deterministic for the same subject', () => {
    const a = pickArm(arms, 'exp1:subject42');
    const b = pickArm(arms, 'exp1:subject42');
    expect(a).toEqual(b);
  });

  it('distributes across arms and roughly honors weights', () => {
    const counts: Record<string, number> = { A: 0, B: 0 };
    for (let i = 0; i < 2000; i++) counts[pickArm(arms, `exp1:s${i}`)!.key] += 1;
    expect(counts.A).toBeGreaterThan(700);
    expect(counts.B).toBeGreaterThan(700);
  });

  it('a zero-weight arm is never chosen', () => {
    const w = [
      { key: 'X', weight: 0 },
      { key: 'Y', weight: 1 },
    ];
    for (let i = 0; i < 200; i++) expect(pickArm(w, `e:${i}`)!.key).toBe('Y');
  });
});
