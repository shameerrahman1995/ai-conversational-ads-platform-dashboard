import { Logger } from '@nestjs/common';
import type { ChatMessage, ModelCompleteOpts, ModelGatewayPort } from './model-gateway.port';
import { providerForModel } from './models';

/**
 * Multi-provider router (blueprint §19 AI plane). Holds one adapter per configured
 * provider ('anthropic' | 'openai' | 'google') plus a deterministic stub fallback,
 * and dispatches each request to the adapter that OWNS the chosen model (resolved
 * via {@link providerForModel} against MODEL_CATALOG). This is what lets a single
 * deployment run Anthropic, OpenAI and Gemini side by side, with each agent's
 * model dropdown selecting the provider transparently.
 *
 * Fail-safe: if the chosen model's provider is not configured (no API key) or the
 * model is unknown, the request routes to the stub instead of erroring — dev/test
 * never call out, and a mis-set model degrades to a safe canned reply rather than a
 * 500. The provider-neutral ModelGatewayPort contract is unchanged.
 */
export class RoutingModelGateway implements ModelGatewayPort {
  private readonly logger = new Logger(RoutingModelGateway.name);
  private readonly warned = new Set<string>();

  constructor(
    private readonly providers: Partial<Record<string, ModelGatewayPort>>,
    private readonly stub: ModelGatewayPort,
    private readonly defaultModel: string,
  ) {}

  async complete(
    messages: ChatMessage[],
    opts?: ModelCompleteOpts,
  ): Promise<{ text: string; model?: string }> {
    const model = opts?.model ?? this.defaultModel;
    // Pass the RESOLVED model down so the chosen adapter uses exactly the model the
    // routing decision was based on (never the adapter's own internal default,
    // which could diverge from the provider we selected).
    const resolved: ModelCompleteOpts = { ...opts, model };
    const provider = providerForModel(model);
    const gateway = this.providers[provider];
    if (!gateway) {
      // Warn once per provider so a missing key is visible without log spam.
      if (!this.warned.has(provider)) {
        this.warned.add(provider);
        this.logger.warn(
          `No live gateway for provider '${provider}' (model '${model}') — using stub. Set the provider's API key + PROVIDERS_MODE=live to enable it.`,
        );
      }
      return this.stub.complete(messages, resolved);
    }
    return gateway.complete(messages, resolved);
  }
}
