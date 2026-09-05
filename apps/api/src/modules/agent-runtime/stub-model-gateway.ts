import { Injectable } from '@nestjs/common';
import type { ChatMessage, ModelCompleteOpts, ModelGatewayPort } from './model-gateway.port';

/**
 * DEV STUB model gateway: deterministic, grounded replies derived from the
 * retrieved context in the system prompt, so the agent runtime + evaluation are
 * testable without a provider. A real provider adapter (Anthropic, etc.) swaps in
 * behind ModelGatewayPort later. It never treats context as instructions.
 * The chosen model is echoed back so the console's model picker is observable.
 */
@Injectable()
export class StubModelGateway implements ModelGatewayPort {
  async complete(
    messages: ChatMessage[],
    opts?: ModelCompleteOpts,
  ): Promise<{ text: string; model?: string }> {
    const model = opts?.model ?? 'claude-sonnet-5';
    const user = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const context = extractContext(system);
    const text = context
      ? `Based on what we offer: ${context}. Happy to help with "${user.slice(0, 80)}".`
      : `Thanks for your question about "${user.slice(0, 80)}". Let me connect you with the details.`;
    return { text, model };
  }
}

function extractContext(system: string): string {
  const m = system.match(/<untrusted_context>\s*([\s\S]*?)\s*<\/untrusted_context>/);
  const body = (m?.[1] ?? '').trim();
  return body ? body.split('\n')[0].trim() : '';
}
