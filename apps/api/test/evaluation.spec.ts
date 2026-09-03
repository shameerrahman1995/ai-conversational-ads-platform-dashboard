import { describe, it, expect } from 'vitest';
import { computeEvalResult } from '../src/modules/agent-runtime/evaluation';

describe('computeEvalResult', () => {
  it('passes when groundedness clears the threshold', () => {
    const r = computeEvalResult([
      { question: 'a', grounded: true, matched: true },
      { question: 'b', grounded: true, matched: false },
    ]);
    expect(r.groundedRate).toBe(1);
    expect(r.passed).toBe(true);
  });

  it('fails when groundedness is below the threshold', () => {
    const r = computeEvalResult([
      { question: 'a', grounded: false, matched: false },
      { question: 'b', grounded: false, matched: false },
    ]);
    expect(r.passed).toBe(false);
  });

  it('an empty golden set never passes', () => {
    expect(computeEvalResult([]).passed).toBe(false);
  });
});
