/**
 * Avatar presentation layer (blueprint §16). A thin persona/presentation wrapper
 * over the existing text agent — the avatar renders the same grounded, guardrailed
 * replies with a face + voice. Presentation is display metadata only; it never
 * changes what the runtime is allowed to say.
 */
export interface AvatarPersona {
  name: string;
  /** TTS voice id the synthesiser adapter understands. */
  voice: string;
  locale: string;
  /** Visual style key the front-end renderer maps to a rig/skin. */
  style: string;
  /** Spoken + shown AI disclosure (legal requirement for a synthetic presenter). */
  disclosure: string;
}

export const DEFAULT_PERSONA: AvatarPersona = {
  name: 'Ava',
  voice: 'neutral_en',
  locale: 'en-US',
  style: 'realtime_2d',
  disclosure: "You're speaking with an AI assistant, not a human.",
};

export interface AvatarPresentation {
  name: string;
  voice: string;
  locale: string;
  style: string;
  disclosure: string;
  /** The avatar widget renders in an isolated iframe with these controls. */
  sandbox: string;
  csp: string;
}

/**
 * Build the client presentation contract for the avatar widget. The disclosure
 * is always present, and the embed is locked to a sandbox so a compromised
 * renderer cannot reach the parent page or the network.
 */
export function buildAvatarPresentation(persona: AvatarPersona = DEFAULT_PERSONA): AvatarPresentation {
  return {
    name: persona.name,
    voice: persona.voice,
    locale: persona.locale,
    style: persona.style,
    disclosure: persona.disclosure,
    sandbox: 'allow-scripts',
    csp: "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'self'",
  };
}

/** Coerce a stored (untrusted) config object into a persona, falling back to defaults. */
export function personaFromConfig(config: Record<string, unknown> | null | undefined): AvatarPersona {
  const c = config ?? {};
  const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);
  return {
    name: str(c.name, DEFAULT_PERSONA.name),
    voice: str(c.voice, DEFAULT_PERSONA.voice),
    locale: str(c.locale, DEFAULT_PERSONA.locale),
    style: str(c.style, DEFAULT_PERSONA.style),
    disclosure: str(c.disclosure, DEFAULT_PERSONA.disclosure),
  };
}
