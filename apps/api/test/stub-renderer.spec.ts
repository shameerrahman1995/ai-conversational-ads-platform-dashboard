import { describe, it, expect } from 'vitest';
import { StubRenderer } from '../src/modules/creative/stub-renderer';
import { validateOutputs } from '../src/modules/creative/format-spec';

describe('StubRenderer', () => {
  it('emits the standard multi-format set that validates clean', () => {
    const outputs = new StubRenderer().render({});
    expect(outputs.length).toBe(5);
    expect(outputs.map((o) => o.format)).toEqual([
      'image_1_1',
      'image_4_5',
      'image_9_16',
      'video',
      'html5',
    ]);
    expect(validateOutputs(outputs).ok).toBe(true);
  });
});
