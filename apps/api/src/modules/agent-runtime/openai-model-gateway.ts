import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessage, ModelCompleteOpts, ModelGatewayPort } from './model-gateway.port';
import { sanitizeModelParams } from './models';

/**
 * Real OpenAI Chat Completions adapter (blueprint §19 AI plane). Uses fetch — no
 * SDK dependency. Activated when PROVIDERS_MODE=live and OPENAI_API_KEY is set and
 * the chosen model is an OpenAI model (see RoutingModelGateway / MODEL_CATALOG).
 * The provider-neutral ModelGatewayPort contract is unchanged, so callers are
 * agnostic to which adapter is bound.
 */
@Injectable()
export class OpenAiModelGateway implements ModelGatewayPort {
  private readonly logger = new Logger(OpenAiModelGateway.name);
  private readonly apiKey = process.env.OPENAI_API_KEY ?? '';
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com';
  private readonly defaultModel = 'gpt-4o';

  async complete(
    messages: ChatMessage[],
    opts?: ModelCompleteOpts,
  ): Promise<{ text: string; model?: string }> {
    const model = opts?.model ?? this.defaultModel;
    // OpenAI takes the system prompt as a `system` role in the message list.
    const chatMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    // Capability registry guardrail: never send a parameter the target model
    // rejects. GPT-4o accepts sampling; reasoning models that don't are stripped
    // here (see models.ts § MODEL_CAPABILITIES).
    const params = sanitizeModelParams(model, {
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
    });

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: params.maxTokens,
        ...(params.temperature != null ? { temperature: params.temperature } : {}),
        messages: chatMessages,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`OpenAI API ${res.status}: ${detail.slice(0, 200)}`);
      throw new Error(`Model provider error (${res.status})`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const text = (data.choices?.[0]?.message?.content ?? '').trim();
    return { text, model: data.model ?? model };
  }
}
