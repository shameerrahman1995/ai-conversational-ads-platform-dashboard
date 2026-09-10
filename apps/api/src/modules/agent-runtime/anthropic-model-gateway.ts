import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessage, ModelCompleteOpts, ModelGatewayPort } from './model-gateway.port';
import { sanitizeModelParams } from './models';

/**
 * Real Anthropic Messages API adapter (blueprint §19 AI plane). Uses fetch — no
 * SDK dependency. Activated when PROVIDERS_MODE=live and ANTHROPIC_API_KEY is set
 * (see agent-runtime.module); otherwise the deterministic StubModelGateway runs.
 * The provider-neutral ModelGatewayPort contract is unchanged, so callers (agent
 * runtime, builder, config preview) are agnostic to which adapter is bound.
 */
@Injectable()
export class AnthropicModelGateway implements ModelGatewayPort {
  private readonly logger = new Logger(AnthropicModelGateway.name);
  private readonly apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  private readonly baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
  private readonly defaultModel = process.env.MODEL_GATEWAY_DEFAULT_MODEL ?? 'claude-sonnet-5';

  async complete(
    messages: ChatMessage[],
    opts?: ModelCompleteOpts,
  ): Promise<{ text: string; model?: string }> {
    const model = opts?.model ?? this.defaultModel;
    // Anthropic takes `system` separately from the turn list.
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Capability registry guardrail: never send a parameter the target model
    // rejects. The Claude 5 reasoning family (Opus 5 / Sonnet 5 / Fable 5.1) 400s
    // on `temperature`, so it is omitted for those models and only sent to models
    // that accept sampling (e.g. Haiku 4.5). See models.ts § MODEL_CAPABILITIES.
    const params = sanitizeModelParams(model, {
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
    });

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: params.maxTokens,
        ...(params.temperature != null ? { temperature: params.temperature } : {}),
        ...(system ? { system } : {}),
        messages: turns,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Anthropic API ${res.status}: ${detail.slice(0, 200)}`);
      throw new Error(`Model provider error (${res.status})`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      model?: string;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();
    return { text, model: data.model ?? model };
  }
}
