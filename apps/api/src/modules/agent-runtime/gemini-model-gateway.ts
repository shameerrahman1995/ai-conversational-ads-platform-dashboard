import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessage, ModelCompleteOpts, ModelGatewayPort } from './model-gateway.port';
import { sanitizeModelParams } from './models';

/**
 * Real Google Gemini adapter (Generative Language API, generateContent). Uses
 * fetch — no SDK dependency. Activated when PROVIDERS_MODE=live and GEMINI_API_KEY
 * is set and the chosen model is a Gemini model (see RoutingModelGateway /
 * MODEL_CATALOG). The provider-neutral ModelGatewayPort contract is unchanged, so
 * callers are agnostic to which adapter is bound.
 *
 * Gemini differs from the OpenAI/Anthropic shape: the system prompt goes in
 * `system_instruction`, the assistant role is `model` (not `assistant`), and turns
 * are `contents: [{ role, parts: [{ text }] }]`.
 */
@Injectable()
export class GeminiModelGateway implements ModelGatewayPort {
  private readonly logger = new Logger(GeminiModelGateway.name);
  private readonly apiKey = process.env.GEMINI_API_KEY ?? '';
  private readonly baseUrl =
    process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com';
  private readonly defaultModel = 'gemini-2.5-flash';

  async complete(
    messages: ChatMessage[],
    opts?: ModelCompleteOpts,
  ): Promise<{ text: string; model?: string }> {
    const model = opts?.model ?? this.defaultModel;

    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Capability registry guardrail: only send sampling params the model accepts.
    const params = sanitizeModelParams(model, {
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
    });

    // API key is passed as a header (x-goog-api-key) rather than a query string so
    // it never lands in URLs/logs.
    const res = await fetch(
      `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: {
            maxOutputTokens: params.maxTokens,
            ...(params.temperature != null ? { temperature: params.temperature } : {}),
          },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Gemini API ${res.status}: ${detail.slice(0, 200)}`);
      throw new Error(`Model provider error (${res.status})`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      modelVersion?: string;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    return { text, model: data.modelVersion ?? model };
  }
}
