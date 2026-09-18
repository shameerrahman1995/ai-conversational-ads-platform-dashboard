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

  it('OpenAI + Gemini models are registered with sampling support', () => {
    expect(getModelCapabilities('gpt-4o').provider).toBe('openai');
    expect(getModelCapabilities('gpt-4o-mini').provider).toBe('openai');
    expect(getModelCapabilities('gemini-2.5-pro').provider).toBe('google');
    expect(getModelCapabilities('gemini-2.5-flash').provider).toBe('google');
    for (const id of ['gpt-4o', 'gpt-4o-mini', 'gemini-2.5-pro', 'gemini-2.5-flash']) {
      expect(modelSupportsSampling(id)).toBe(true);
    }
  });

  it('sanitize keeps temperature for OpenAI/Gemini (they accept 0–2)', () => {
    expect(sanitizeModelParams('gpt-4o', { temperature: 0.7, maxTokens: 512 }).temperature).toBe(0.7);
    expect(sanitizeModelParams('gemini-2.5-pro', { temperature: 1.5, maxTokens: 512 }).temperature).toBe(1.5);
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
