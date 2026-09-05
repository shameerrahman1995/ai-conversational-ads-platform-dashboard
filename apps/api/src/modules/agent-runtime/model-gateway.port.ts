export const MODEL_GATEWAY = Symbol('MODEL_GATEWAY');

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Provider-neutral model gateway (blueprint §19 AI plane). Adapters for
 *  Anthropic/others implement this; the runtime never talks to a provider SDK. */
export interface ModelCompleteOpts {
  maxTokens?: number;
  model?: string;
  temperature?: number;
}

export interface ModelGatewayPort {
  complete(messages: ChatMessage[], opts?: ModelCompleteOpts): Promise<{ text: string; model?: string }>;
}
