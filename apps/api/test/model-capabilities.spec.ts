import { describe, it, expect } from 'vitest';
import {
  getModelCapabilities,
  modelSupportsSampling,
  sanitizeModelParams,
} from '../src/modules/agent-runtime/models';

describe('model capability registry', () => {
  it('Claude 5 reasoning models reject sampling params (temperature/top_p/top_k)', () => {
    for (const id of ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1']) {
      expect(modelSupportsSampling(id)).toBe(false);
    }
  });

  it('Haiku 4.5 accepts sampling params', () => {
    expect(modelSupportsSampling('claude-haiku-4-5')).toBe(true);
  });

  it('an unknown model fails closed — no sampling assumed', () => {
    expect(modelSupportsSampling('gpt-vapor-9')).toBe(false);
    expect(getModelCapabilities('gpt-vapor-9').provider).toBe('unknown');
  });

  it('sanitize strips temperature for reasoning models (would 400)', () => {
    const p = sanitizeModelParams('claude-sonnet-5', { temperature: 0.4, maxTokens: 1024 });
    expect(p.temperature).toBeUndefined();
    expect(p.maxTokens).toBe(1024);
  });

  it('sanitize keeps and clamps temperature + max_tokens for sampling models', () => {
    const p = sanitizeModelParams('claude-haiku-4-5', { temperature: 2, maxTokens: 999999 });
    expect(p.temperature).toBe(1);
    expect(p.maxTokens).toBe(8192);
  });

  it('sanitize defaults max_tokens when unset', () => {
    expect(sanitizeModelParams('claude-sonnet-5', {}).maxTokens).toBe(1024);
  });
});
