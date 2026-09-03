/**
 * Provider-neutral speech ports (blueprint §16 voice/avatar plane). The runtime
 * never talks to a Deepgram/ElevenLabs/etc. SDK directly — adapters implement
 * these ports and are swapped in per environment. Stubs keep the plane testable
 * without live credentials.
 */
export const SPEECH_TO_TEXT = Symbol('SPEECH_TO_TEXT');
export const TEXT_TO_SPEECH = Symbol('TEXT_TO_SPEECH');

export interface TranscriptResult {
  text: string;
  /** 0..1 recogniser confidence. */
  confidence: number;
  durationMs: number;
}

export interface SpeechToTextPort {
  transcribe(
    audio: Buffer,
    opts: { mimeType: string; locale?: string; hint?: string },
  ): Promise<TranscriptResult>;
}

/** A mouth-shape keyframe the avatar renderer interpolates for lip-sync. */
export interface Viseme {
  /** offset from the start of the clip, ms */
  t: number;
  shape: string;
}

export interface SpeechResult {
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  visemes: Viseme[];
}

export interface TextToSpeechPort {
  synthesize(text: string, opts: { voice: string; locale?: string }): Promise<SpeechResult>;
}
