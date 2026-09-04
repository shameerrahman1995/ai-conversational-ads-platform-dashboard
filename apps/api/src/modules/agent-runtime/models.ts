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
