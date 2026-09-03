import { describe, it, expect } from 'vitest';
import { StubModelGateway } from '../src/modules/agent-runtime/stub-model-gateway';
import { SYSTEM_POLICY, wrapUntrusted } from '../src/modules/agent-runtime/guardrails';

describe('StubModelGateway', () => {
  const g = new StubModelGateway();

  it('grounds the reply in the provided context', async () => {
    const { text } = await g.complete([
      { role: 'system', content: `${SYSTEM_POLICY}\n\n${wrapUntrusted('Fast setup in minutes')}` },
      { role: 'user', content: 'how fast?' },
    ]);
    expect(text).toContain('Fast setup in minutes');
  });

  it('handles missing context', async () => {
    const { text } = await g.complete([{ role: 'user', content: 'hi' }]);
    expect(text.length).toBeGreaterThan(0);
  });
});
