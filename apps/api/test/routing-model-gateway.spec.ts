import { describe, it, expect } from 'vitest';
import { RoutingModelGateway } from '../src/modules/agent-runtime/routing-model-gateway';
import { providerForModel } from '../src/modules/agent-runtime/models';
import type {
  ChatMessage,
  ModelCompleteOpts,
  ModelGatewayPort,
} from '../src/modules/agent-runtime/model-gateway.port';

/** A gateway that records the model it was asked for and echoes an id tag. */
class SpyGateway implements ModelGatewayPort {
  calls: string[] = [];
  constructor(private readonly tag: string) {}
  async complete(_messages: ChatMessage[], opts?: ModelCompleteOpts) {
    const model = opts?.model ?? 'default';
    this.calls.push(model);
    return { text: `from:${this.tag}`, model };
  }
}

const MSGS: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('providerForModel', () => {
  it('maps each catalog model to its provider', () => {
    expect(providerForModel('claude-sonnet-5')).toBe('anthropic');
    expect(providerForModel('gpt-4o')).toBe('openai');
    expect(providerForModel('gpt-4o-mini')).toBe('openai');
    expect(providerForModel('gemini-2.5-pro')).toBe('google');
    expect(providerForModel('gemini-2.5-flash')).toBe('google');
  });
  it('returns unknown for an unrecognised model', () => {
    expect(providerForModel('gpt-vapor-9')).toBe('unknown');
  });
});

describe('RoutingModelGateway', () => {
  function build() {
    const anthropic = new SpyGateway('anthropic');
    const openai = new SpyGateway('openai');
    const google = new SpyGateway('google');
    const stub = new SpyGateway('stub');
    const router = new RoutingModelGateway(
      { anthropic, openai, google },
      stub,
      'claude-sonnet-5',
    );
    return { router, anthropic, openai, google, stub };
  }

  it('routes an Anthropic model to the Anthropic adapter', async () => {
    const { router, anthropic } = build();
    const r = await router.complete(MSGS, { model: 'claude-opus-5' });
    expect(r.text).toBe('from:anthropic');
    expect(anthropic.calls).toEqual(['claude-opus-5']);
  });

  it('routes an OpenAI model to the OpenAI adapter', async () => {
    const { router, openai } = build();
    const r = await router.complete(MSGS, { model: 'gpt-4o' });
    expect(r.text).toBe('from:openai');
    expect(openai.calls).toEqual(['gpt-4o']);
  });

  it('routes a Gemini model to the Google adapter', async () => {
    const { router, google } = build();
    const r = await router.complete(MSGS, { model: 'gemini-2.5-flash' });
    expect(r.text).toBe('from:google');
    expect(google.calls).toEqual(['gemini-2.5-flash']);
  });

  it('uses the default model (and its provider) when none is given', async () => {
    const { router, anthropic } = build();
    const r = await router.complete(MSGS);
    expect(r.model).toBe('claude-sonnet-5');
    expect(anthropic.calls).toEqual(['claude-sonnet-5']);
  });

  it('falls back to the stub when the model provider is not configured', async () => {
    const openai = new SpyGateway('openai');
    const stub = new SpyGateway('stub');
    // Only OpenAI configured; a Gemini model must degrade to the stub, not throw.
    const router = new RoutingModelGateway({ openai }, stub, 'gpt-4o');
    const r = await router.complete(MSGS, { model: 'gemini-2.5-pro' });
    expect(r.text).toBe('from:stub');
    expect(stub.calls).toEqual(['gemini-2.5-pro']);
    expect(openai.calls).toEqual([]);
  });

  it('falls back to the stub for an unknown model', async () => {
    const { router, stub } = build();
    const r = await router.complete(MSGS, { model: 'gpt-vapor-9' });
    expect(r.text).toBe('from:stub');
    expect(stub.calls).toEqual(['gpt-vapor-9']);
  });
});
