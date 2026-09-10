/**
 * Model catalog + agent settings (blueprint §16/§19 AI plane). The catalog is the
 * provider-neutral menu the console exposes; ids map to whatever the deployed
 * ModelGatewayPort adapter understands. Settings are stored per agent as JSON.
 */
export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  tier: 'frontier' | 'balanced' | 'fast';
  description: string;
  recommendedFor: string[];
}

export const MODEL_CATALOG: ModelOption[] = [
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    provider: 'anthropic',
    tier: 'frontier',
    description: 'Most capable — best for nuanced sales conversations and complex objections.',
    recommendedFor: ['agent', 'copywriter'],
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    tier: 'balanced',
    description: 'Balanced quality and cost — a strong default for live agents at scale.',
    recommendedFor: ['agent', 'copywriter'],
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    tier: 'fast',
    description: 'Fastest and cheapest — great for high-volume, short interactions.',
    recommendedFor: ['agent'],
  },
  {
    id: 'claude-fable-5-1',
    label: 'Claude Fable 5.1',
    provider: 'anthropic',
    tier: 'balanced',
    description: 'Creative copy specialist — punchy, on-brand ad variants.',
    recommendedFor: ['copywriter'],
  },
];

export function isKnownModel(id: string): boolean {
  return MODEL_CATALOG.some((m) => m.id === id);
}

/**
 * Per-model provider capability registry (blueprint §19 AI plane). Verified against
 * current official Anthropic Messages API docs on 2026-09-11 (see
 * docs/platform-verification/ai-providers-verification.md + the claude-api skill):
 * the Claude 5 reasoning family (Opus 5, Sonnet 5, Fable 5.1) REMOVED the sampling
 * parameters temperature/top_p/top_k and returns HTTP 400 if any are sent — depth is
 * controlled by output_config.effort instead. Only Haiku 4.5 still accepts sampling.
 *
 * The model gateway consults this registry before every request so the platform can
 * never send an unsupported model parameter (a master, non-negotiable rule). Support
 * is keyed on the model id, not the provider, because it differs within a provider.
 */
export interface ModelCapabilities {
  provider: string;
  /** Whether temperature/top_p/top_k are accepted without a 400. */
  supportsSampling: boolean;
  /** Inclusive temperature range when sampling is supported. */
  temperatureRange: [number, number];
  /** Ceiling we allow for max_tokens (app policy — not the model's hard max). */
  maxOutputTokens: number;
  /** How reasoning depth is controlled (documentation + future wiring). */
  reasoningControl: 'effort' | 'budget_tokens' | 'none';
}

const APP_MAX_OUTPUT_TOKENS = 8192;

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'claude-opus-5': { provider: 'anthropic', supportsSampling: false, temperatureRange: [0, 1], maxOutputTokens: APP_MAX_OUTPUT_TOKENS, reasoningControl: 'effort' },
  'claude-sonnet-5': { provider: 'anthropic', supportsSampling: false, temperatureRange: [0, 1], maxOutputTokens: APP_MAX_OUTPUT_TOKENS, reasoningControl: 'effort' },
  'claude-fable-5-1': { provider: 'anthropic', supportsSampling: false, temperatureRange: [0, 1], maxOutputTokens: APP_MAX_OUTPUT_TOKENS, reasoningControl: 'effort' },
  'claude-haiku-4-5': { provider: 'anthropic', supportsSampling: true, temperatureRange: [0, 1], maxOutputTokens: APP_MAX_OUTPUT_TOKENS, reasoningControl: 'budget_tokens' },
};

/**
 * Fail-closed default for an unknown model id: assume sampling is NOT supported, so
 * we never send temperature to a reasoning model that would reject it. Unsupported
 * combinations fail closed (a non-negotiable rule).
 */
const UNKNOWN_MODEL_CAPS: ModelCapabilities = {
  provider: 'unknown',
  supportsSampling: false,
  temperatureRange: [0, 1],
  maxOutputTokens: APP_MAX_OUTPUT_TOKENS,
  reasoningControl: 'none',
};

export function getModelCapabilities(modelId: string): ModelCapabilities {
  return MODEL_CAPABILITIES[modelId] ?? UNKNOWN_MODEL_CAPS;
}

/** Does this model accept temperature/top_p/top_k at all? */
export function modelSupportsSampling(modelId: string): boolean {
  return getModelCapabilities(modelId).supportsSampling;
}

export interface SanitizedModelParams {
  maxTokens: number;
  /** Present ONLY when the target model accepts sampling params. */
  temperature?: number;
}

/**
 * Strip parameters the target model does not support and clamp the rest to safe
 * ranges — the single guardrail enforcing "never send an unsupported model
 * parameter". temperature is dropped for the Claude 5 reasoning family (which 400s
 * on it) and kept, clamped, for models that accept it.
 */
export function sanitizeModelParams(
  modelId: string,
  requested: { temperature?: number; maxTokens?: number },
): SanitizedModelParams {
  const caps = getModelCapabilities(modelId);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const maxTokens =
    typeof requested.maxTokens === 'number' && requested.maxTokens > 0
      ? clamp(Math.floor(requested.maxTokens), 1, caps.maxOutputTokens)
      : 1024;
  const out: SanitizedModelParams = { maxTokens };
  if (caps.supportsSampling && typeof requested.temperature === 'number') {
    out.temperature = clamp(requested.temperature, caps.temperatureRange[0], caps.temperatureRange[1]);
  }
  return out;
}

export interface VoiceSettings {
  enabled: boolean;
  provider?: string; // e.g. 'elevenlabs' | 'deepgram'
  voiceId?: string;
  recordingConsent: boolean;
}
export interface AvatarSettings {
  enabled: boolean;
  provider?: string; // e.g. 'heygen' | 'did'
  style?: string;
}
export interface ToolSettings {
  booking: boolean;
  crm: boolean;
  pricing: boolean;
}

export interface AgentSettings {
  name: string;
  persona: string;
  tone: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  openingMessage: string;
  disclosure: string;
  voice: VoiceSettings;
  avatar: AvatarSettings;
  tools: ToolSettings;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  name: 'Sales agent',
  persona: 'Helpful product assistant',
  tone: 'Warm & consultative',
  model: 'claude-sonnet-5',
  temperature: 0.4,
  maxTokens: 1024,
  systemPrompt:
    'You are a helpful sales assistant. Answer only from approved facts; if unsure, say you will connect a human. Never invent claims.',
  openingMessage: "Hi! You're chatting with an AI assistant. How can I help?",
  disclosure: "You're chatting with an AI assistant, not a human.",
  voice: { enabled: false, recordingConsent: false },
  avatar: { enabled: false, style: 'realtime_2d' },
  tools: { booking: true, crm: true, pricing: false },
};

/** Merge stored (possibly partial/untrusted) settings over defaults. */
export function normalizeSettings(raw: unknown): AgentSettings {
  const s = (raw ?? {}) as Partial<AgentSettings>;
  const d = DEFAULT_AGENT_SETTINGS;
  const model = typeof s.model === 'string' && isKnownModel(s.model) ? s.model : d.model;
  const temperature =
    typeof s.temperature === 'number' && s.temperature >= 0 && s.temperature <= 1
      ? s.temperature
      : d.temperature;
  const maxTokens =
    typeof s.maxTokens === 'number' && s.maxTokens > 0 && s.maxTokens <= 8192 ? s.maxTokens : d.maxTokens;
  const str = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v : fb);
  return {
    name: str(s.name, d.name),
    persona: str(s.persona, d.persona),
    tone: str(s.tone, d.tone),
    model,
    temperature,
    maxTokens,
    systemPrompt: str(s.systemPrompt, d.systemPrompt),
    openingMessage: str(s.openingMessage, d.openingMessage),
    disclosure: str(s.disclosure, d.disclosure),
    voice: {
      enabled: Boolean(s.voice?.enabled),
      provider: s.voice?.provider,
      voiceId: s.voice?.voiceId,
      recordingConsent: Boolean(s.voice?.recordingConsent),
    },
    avatar: {
      enabled: Boolean(s.avatar?.enabled),
      provider: s.avatar?.provider,
      style: str(s.avatar?.style, d.avatar.style!),
    },
    tools: {
      booking: s.tools?.booking ?? d.tools.booking,
      crm: s.tools?.crm ?? d.tools.crm,
      pricing: s.tools?.pricing ?? d.tools.pricing,
    },
  };
}
