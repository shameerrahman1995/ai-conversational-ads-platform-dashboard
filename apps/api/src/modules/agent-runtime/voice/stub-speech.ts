import { Injectable } from '@nestjs/common';
import type {
  SpeechResult,
  SpeechToTextPort,
  TextToSpeechPort,
  TranscriptResult,
  Viseme,
} from './speech.port';

/**
 * Deterministic, offline STT/TTS stubs. No external calls or credentials — the
 * transcript comes from an explicit `hint` (dev/test) and TTS emits a silent,
 * correctly-shaped clip with viseme timings derived from the text. Real adapters
 * replace these behind the same ports.
 */
@Injectable()
export class StubSpeechToText implements SpeechToTextPort {
  async transcribe(
    audio: Buffer,
    opts: { mimeType: string; locale?: string; hint?: string },
  ): Promise<TranscriptResult> {
    const text = (opts.hint ?? '').trim() || '[inaudible]';
    // ~150 wpm → ms; floor so tiny clips still register.
    const words = text.split(/\s+/).filter(Boolean).length;
    return { text, confidence: opts.hint ? 0.95 : 0.2, durationMs: Math.max(400, words * 400) };
  }
}

const VISEME_SHAPES = ['AI', 'E', 'U', 'O', 'FV', 'L', 'MBP', 'rest'];

@Injectable()
export class StubTextToSpeech implements TextToSpeechPort {
  async synthesize(text: string, opts: { voice: string; locale?: string }): Promise<SpeechResult> {
    const clean = text.trim();
    const words = clean.split(/\s+/).filter(Boolean).length || 1;
    const durationMs = Math.max(500, words * 380);
    const visemes: Viseme[] = [];
    const step = durationMs / (words + 1);
    for (let i = 0; i < words; i++) {
      visemes.push({ t: Math.round(step * (i + 1)), shape: VISEME_SHAPES[i % VISEME_SHAPES.length] });
    }
    // A minimal, valid (silent) WAV header so downstream players accept the clip.
    return {
      audioBase64: SILENT_WAV_BASE64,
      mimeType: 'audio/wav',
      durationMs,
      visemes,
    };
  }
}

// 44-byte WAV header + no samples: a valid, empty PCM clip.
const SILENT_WAV_BASE64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
