import { Module } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentBuilderService } from './agent-builder.service';
import { AgentConfigService } from './agent-config.service';
import { AgentController } from './agent.controller';
import { AgentSessionController } from './agent-session.controller';
import { MODEL_GATEWAY } from './model-gateway.port';
import { StubModelGateway } from './stub-model-gateway';
import { VoiceSessionService } from './voice/voice-session.service';
import { SPEECH_TO_TEXT, TEXT_TO_SPEECH } from './voice/speech.port';
import { StubSpeechToText, StubTextToSpeech } from './voice/stub-speech';

// Hosted conversational agent (blueprint §16): builder, eval-gated publish,
// runtime, and the voice/avatar plane layered over the same guardrailed runtime.
@Module({
  controllers: [AgentController, AgentSessionController],
  providers: [
    AgentRuntimeService,
    AgentBuilderService,
    AgentConfigService,
    VoiceSessionService,
    { provide: MODEL_GATEWAY, useClass: StubModelGateway },
    { provide: SPEECH_TO_TEXT, useClass: StubSpeechToText },
    { provide: TEXT_TO_SPEECH, useClass: StubTextToSpeech },
  ],
})
export class AgentRuntimeModule {}
