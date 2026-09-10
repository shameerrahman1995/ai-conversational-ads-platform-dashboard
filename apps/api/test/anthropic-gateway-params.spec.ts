import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnthropicModelGateway } from '../src/modules/agent-runtime/anthropic-model-gateway';

/** Stub global fetch and capture each request body sent to the Messages API. */
function captureBodies(): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return {
        ok: true,
        text: async () => '',
        json: async () => ({ content: [{ type: 'text', text: 'ok' }], model: 'm' }),
      } as unknown as Response;
    }),
  );
  return bodies;
}

afterEach(() => vi.unstubAllGlobals());

describe('AnthropicModelGateway parameter sanitization', () => {
  it('omits temperature for a Claude 5 reasoning model (which returns 400 on it)', async () => {
    const bodies = captureBodies();
    await new AnthropicModelGateway().complete([{ role: 'user', content: 'hi' }], {
      model: 'claude-sonnet-5',
      temperature: 0.4,
    });
    expect(bodies[0].model).toBe('claude-sonnet-5');
    expect('temperature' in bodies[0]).toBe(false);
  });

  it('sends temperature for a sampling-capable model (Haiku 4.5)', async () => {
    const bodies = captureBodies();
    await new AnthropicModelGateway().complete([{ role: 'user', content: 'hi' }], {
      model: 'claude-haiku-4-5',
      temperature: 0.4,
    });
    expect(bodies[0].temperature).toBe(0.4);
  });

  it('defaults max_tokens when unset', async () => {
    const bodies = captureBodies();
    await new AnthropicModelGateway().complete([{ role: 'user', content: 'hi' }], {
      model: 'claude-sonnet-5',
    });
    expect(bodies[0].max_tokens).toBe(1024);
  });
});
