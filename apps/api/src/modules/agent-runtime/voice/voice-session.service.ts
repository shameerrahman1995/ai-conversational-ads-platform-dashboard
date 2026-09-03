import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/audit/audit.service';
import { scopedWhere } from '../../../common/tenant/scoped-where';
import { AgentRuntimeService, type AgentReply } from '../agent-runtime.service';
import {
  SPEECH_TO_TEXT,
  TEXT_TO_SPEECH,
  type SpeechResult,
  type SpeechToTextPort,
  type TextToSpeechPort,
} from './speech.port';
import {
  buildAvatarPresentation,
  personaFromConfig,
  type AvatarPersona,
  type AvatarPresentation,
} from './avatar';

export interface VoiceTurnInput {
  audio: Buffer;
  mimeType: string;
  /** Two-party-consent gate for retaining the recording. */
  recordingConsent: boolean;
  /** Dev/test transcript for the offline STT stub. */
  transcriptHint?: string;
  locale?: string;
}

export interface VoiceTurnResult {
  transcript: string;
  confidence: number;
  reply: AgentReply;
  speech: SpeechResult;
  presentation: AvatarPresentation;
  /** Whether the recording was retained (only when call-recording consent was given). */
  recordingRetained: boolean;
}

/**
 * Voice + avatar session orchestration (blueprint §16). A voice turn is STT →
 * the SAME guardrailed text runtime → TTS + viseme timings for the avatar. The
 * runtime remains the single source of truth for what may be said; voice adds a
 * modality, not new capabilities. Consent is layered: AI-disclosure consent
 * gates the session (enforced by the runtime), and call-recording consent gates
 * whether audio is retained. Raw audio is never persisted; only the runtime's
 * already-redacted transcript rows are stored.
 */
@Injectable()
export class VoiceSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: AgentRuntimeService,
    private readonly audit: AuditService,
    @Inject(SPEECH_TO_TEXT) private readonly stt: SpeechToTextPort,
    @Inject(TEXT_TO_SPEECH) private readonly tts: TextToSpeechPort,
  ) {}

  async voiceTurn(
    orgId: string,
    conversationId: string,
    input: VoiceTurnInput,
  ): Promise<VoiceTurnResult> {
    const convo = await this.prisma.conversation.findFirst({
      where: scopedWhere(orgId, { id: conversationId }),
      include: { lead: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (!convo.consent) throw new ForbiddenException('AI-disclosure consent required');

    const persona = await this.resolvePersona(orgId, convo.agentId);

    // Transcribe the visitor turn. Raw audio is transient — only the transcript flows on.
    const { text: transcript, confidence } = await this.stt.transcribe(input.audio, {
      mimeType: input.mimeType,
      locale: input.locale ?? persona.locale,
      hint: input.transcriptHint,
    });

    // Route through the guardrailed text runtime (persists redacted turns, grounds, screens).
    const reply = await this.runtime.sendMessage(orgId, conversationId, transcript);

    // Speak the approved reply and produce lip-sync timings for the avatar.
    const speech = await this.tts.synthesize(reply.reply, {
      voice: persona.voice,
      locale: persona.locale,
    });

    // Call-recording consent: record it against the lead when present; gate retention.
    const recordingRetained = input.recordingConsent === true;
    if (recordingRetained && convo.lead) {
      await this.prisma.consentRecord.create({
        data: {
          leadId: convo.lead.id,
          type: 'call_recording',
          granted: true,
          disclosureVersion: persona.disclosure,
        },
      });
    }

    await this.audit.record({
      orgId,
      action: 'agent.voice_turn',
      target: conversationId,
      metadata: {
        confidence,
        recordingRetained,
        grounded: reply.grounded,
        fallback: reply.fallback,
      },
    });

    return {
      transcript,
      confidence,
      reply,
      speech,
      presentation: buildAvatarPresentation(persona),
      recordingRetained,
    };
  }

  /** Presentation contract for the avatar widget of a given agent. */
  async presentation(orgId: string, agentId: string): Promise<AvatarPresentation> {
    return buildAvatarPresentation(await this.resolvePersona(orgId, agentId));
  }

  private async resolvePersona(orgId: string, agentId: string): Promise<AvatarPersona> {
    const agent = await this.prisma.agentConfig.findFirst({
      where: scopedWhere(orgId, { id: agentId }),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    const latest = await this.prisma.agentVersion.findFirst({
      where: { agentConfigId: agent.id },
      orderBy: { version: 'desc' },
    });
    const cfg = (latest?.config ?? null) as Record<string, unknown> | null;
    const avatarCfg = (cfg?.avatar ?? cfg?.identity ?? cfg) as Record<string, unknown> | null;
    return personaFromConfig(avatarCfg);
  }
}
