import { describe, it, expect } from 'vitest';
import { normalizeSettings, DEFAULT_AGENT_SETTINGS } from '../src/modules/agent-runtime/models';

describe('normalizeSettings — V10 studio sections', () => {
  it('defaults the new sections when absent', () => {
    const s = normalizeSettings({});
    expect(s.runtime?.fallbackModel).toBe(DEFAULT_AGENT_SETTINGS.runtime!.fallbackModel);
    expect(s.retrieval?.topK).toBe(DEFAULT_AGENT_SETTINGS.retrieval!.topK);
    expect(s.qualification?.fields).toEqual([]);
    expect(Array.isArray(s.safety?.guardrails)).toBe(true);
    expect(s.knowledgeSourceIds).toEqual([]);
    expect(s.setup?.industry).toBe(DEFAULT_AGENT_SETTINGS.setup!.industry);
  });

  it('preserves stored studio config (qualification fields, safety, knowledge ids)', () => {
    const stored = {
      qualification: { fields: [{ id: 'q1', label: 'Timeline', type: 'select', required: true, options: ['Now'] }], threshold: 80 },
      safety: { guardrails: ['Custom guardrail'], adversarialPrompts: ['Do the bad thing'] },
      knowledgeSourceIds: ['kb1', 'kb2'],
      runtime: { fallbackModel: 'claude-haiku-4-5', costCapUsd: 0.05 },
    };
    const s = normalizeSettings(stored);
    expect(s.qualification?.fields).toHaveLength(1);
    expect(s.qualification?.threshold).toBe(80);
    expect(s.safety?.guardrails).toEqual(['Custom guardrail']);
    expect(s.knowledgeSourceIds).toEqual(['kb1', 'kb2']);
    expect(s.runtime?.costCapUsd).toBe(0.05);
  });

  it('still validates the security-critical core fields', () => {
    const s = normalizeSettings({ model: 'not-a-real-model', temperature: 5, maxTokens: 999999 });
    expect(s.model).toBe(DEFAULT_AGENT_SETTINGS.model); // unknown model rejected
    expect(s.temperature).toBe(DEFAULT_AGENT_SETTINGS.temperature); // out-of-range rejected
    expect(s.maxTokens).toBe(DEFAULT_AGENT_SETTINGS.maxTokens); // over ceiling rejected
  });

  it('drops non-string entries from knowledgeSourceIds', () => {
    const s = normalizeSettings({ knowledgeSourceIds: ['ok', 42, null, 'ok2'] });
    expect(s.knowledgeSourceIds).toEqual(['ok', 'ok2']);
  });
});
