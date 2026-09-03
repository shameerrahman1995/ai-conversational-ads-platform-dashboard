import { describe, it, expect, vi } from 'vitest';
import { VoiceSessionService } from '../src/modules/agent-runtime/voice/voice-session.service';
import { StubSpeechToText, StubTextToSpeech } from '../src/modules/agent-runtime/voice/stub-speech';
import { buildAvatarPresentation, personaFromConfig, DEFAULT_PERSONA } from '../src/modules/agent-runtime/voice/avatar';

function make(opts: { convo?: any; lead?: any } = {}) {
  const convo =
    'convo' in opts
      ? opts.convo
      : { id: 'c1', orgId: 'org_1', agentId: 'a1', consent: true, lead: opts.lead ?? null };
  const prisma = {
    conversation: { findFirst: vi.fn().mockResolvedValue(convo) },
    agentConfig: { findFirst: vi.fn().mockResolvedValue({ id: 'a1', orgId: 'org_1' }) },
    agentVersion: { findFirst: vi.fn().mockResolvedValue({ config: { avatar: { name: 'Nova', voice: 'v2' } } }) },
    consentRecord: { create: vi.fn().mockResolvedValue({}) },
  } as any;
  const runtime = {
    sendMessage: vi.fn().mockResolvedValue({ reply: 'Hello there', grounded: true, citations: ['d1'], fallback: false }),
  } as any;
  const audit = { record: vi.fn() } as any;
  const svc = new VoiceSessionService(prisma, runtime, audit, new StubSpeechToText(), new StubTextToSpeech());
  return { svc, prisma, runtime, audit };
}

describe('avatar presentation', () => {
  it('always carries a disclosure and a locked-down sandbox/CSP', () => {
    const p = buildAvatarPresentation();
    expect(p.disclosure).toBe(DEFAULT_PERSONA.disclosure);
    expect(p.sandbox).toBe('allow-scripts');
    expect(p.csp).toContain("default-src 'none'");
  });
  it('personaFromConfig overrides known fields and defaults the rest', () => {
    const p = personaFromConfig({ name: 'Rex', voice: '' });
    expect(p.name).toBe('Rex');
    expect(p.voice).toBe(DEFAULT_PERSONA.voice); // empty falls back
    expect(p.locale).toBe(DEFAULT_PERSONA.locale);
  });
});

describe('stub speech', () => {
  it('STT echoes the hint transcript with high confidence', async () => {
    const r = await new StubSpeechToText().transcribe(Buffer.from('x'), { mimeType: 'audio/webm', hint: 'hi there' });
    expect(r.text).toBe('hi there');
    expect(r.confidence).toBeGreaterThan(0.5);
  });
  it('TTS returns a WAV clip with viseme keyframes', async () => {
    const r = await new StubTextToSpeech().synthesize('one two three', { voice: 'v1' });
    expect(r.mimeType).toBe('audio/wav');
    expect(r.audioBase64.length).toBeGreaterThan(0);
    expect(r.visemes.length).toBe(3);
  });
});

describe('VoiceSessionService.voiceTurn', () => {
  it('404 when the conversation is missing/other-org', async () => {
    const { svc } = make({ convo: null });
    await expect(
      svc.voiceTurn('org_1', 'x', { audio: Buffer.from('a'), mimeType: 'audio/webm', recordingConsent: false }),
    ).rejects.toThrow();
  });

  it('rejects a session without AI-disclosure consent', async () => {
    const { svc } = make({ convo: { id: 'c1', orgId: 'org_1', agentId: 'a1', consent: false, lead: null } });
    await expect(
      svc.voiceTurn('org_1', 'c1', { audio: Buffer.from('a'), mimeType: 'audio/webm', recordingConsent: false }),
    ).rejects.toThrow();
  });

  it('runs STT -> guardrailed runtime -> TTS and returns transcript/reply/speech/presentation', async () => {
    const { svc, runtime } = make();
    const out = await svc.voiceTurn('org_1', 'c1', {
      audio: Buffer.from('a'),
      mimeType: 'audio/webm',
      recordingConsent: false,
      transcriptHint: 'what are your hours',
    });
    expect(runtime.sendMessage).toHaveBeenCalledWith('org_1', 'c1', 'what are your hours');
    expect(out.transcript).toBe('what are your hours');
    expect(out.reply.reply).toBe('Hello there');
    expect(out.speech.mimeType).toBe('audio/wav');
    expect(out.presentation.name).toBe('Nova'); // sourced from agent version config
    expect(out.recordingRetained).toBe(false);
  });

  it('records call-recording consent against the lead when consent is granted', async () => {
    const { svc, prisma } = make({ lead: { id: 'lead_1' } });
    const out = await svc.voiceTurn('org_1', 'c1', {
      audio: Buffer.from('a'),
      mimeType: 'audio/webm',
      recordingConsent: true,
      transcriptHint: 'hi',
    });
    expect(out.recordingRetained).toBe(true);
    expect(prisma.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: 'lead_1', type: 'call_recording', granted: true }) }),
    );
  });

  it('does not persist consent when there is no lead, even with consent granted', async () => {
    const { svc, prisma } = make(); // lead null
    const out = await svc.voiceTurn('org_1', 'c1', {
      audio: Buffer.from('a'),
      mimeType: 'audio/webm',
      recordingConsent: true,
      transcriptHint: 'hi',
    });
    expect(out.recordingRetained).toBe(true);
    expect(prisma.consentRecord.create).not.toHaveBeenCalled();
  });
});
