import { Module } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentBuilderService } from './agent-builder.service';
import { AgentConfigService } from './agent-config.service';
import { AgentController } from './agent.controller';
import { AgentSessionController } from './agent-session.controller';
import { Logger } from '@nestjs/common';
import { loadEnv } from '@acp/config';
import { MODEL_GATEWAY } from './model-gateway.port';
import { StubModelGateway } from './stub-model-gateway';
import { AnthropicModelGateway } from './anthropic-model-gateway';
import { VoiceSessionService } from './voice/voice-session.service';
import { SPEECH_TO_TEXT, TEXT_TO_SPEECH } from './voice/speech.port';
import { StubSpeechToText, StubTextToSpeech } from './voice/stub-speech';

// Provider selection: use the real Anthropic adapter when PROVIDERS_MODE=live and
// a key is present; otherwise the deterministic stub (so dev/test never call out).
function modelGatewayFactory() {
  const env = loadEnv();
  if (env.PROVIDERS_MODE === 'live' && env.ANTHROPIC_API_KEY) {
    new Logger('AgentRuntimeModule').log('MODEL_GATEWAY: Anthropic (live)');
    return new AnthropicModelGateway();
  }
  return new StubModelGateway();
}

// Hosted conversational agent (blueprint §16): builder, eval-gated publish,
// runtime, and the voice/avatar plane layered over the same guardrailed runtime.
@Module({
  controllers: [AgentController, AgentSessionController],
  providers: [
    AgentRuntimeService,
    AgentBuilderService,
    AgentConfigService,
    VoiceSessionService,
    { provide: MODEL_GATEWAY, useFactory: modelGatewayFactory },
    { provide: SPEECH_TO_TEXT, useClass: StubSpeechToText },
    { provide: TEXT_TO_SPEECH, useClass: StubTextToSpeech },
  ],
})
export class AgentRuntimeModule {}
