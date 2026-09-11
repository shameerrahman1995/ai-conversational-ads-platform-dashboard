import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentBuilderService } from './agent-builder.service';
import { AgentConfigService } from './agent-config.service';
import { AgentRegressionService } from './regression.service';
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
import { LeadModule } from '../lead/lead.module';
import { AdSessionController } from './edge/ad-session.controller';
import { CreativeBootstrapController } from './edge/creative-bootstrap.controller';
import { AdSessionService } from './edge/ad-session.service';
import { AdSessionStore, AD_SESSION_REDIS } from './edge/ad-session.store';
import { EdgeEventsService } from './edge/edge-events.service';

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

// Dedicated ioredis connection for the ad-session store. lazyConnect so the API
// boots without Redis; the connection opens on first ad-session activity.
const adSessionRedisProvider = {
  provide: AD_SESSION_REDIS,
  useFactory: () => new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true }),
};

// Hosted conversational agent (blueprint §16): builder, eval-gated publish,
// runtime, and the voice/avatar plane layered over the same guardrailed runtime.
// The visitor-facing ad-session edge API (blueprint §4/§5) is registered here so
// it reuses AgentRuntimeService additively; LeadModule provides LeadService.
@Module({
  imports: [LeadModule],
  controllers: [AgentController, AgentSessionController, AdSessionController, CreativeBootstrapController],
  providers: [
    AgentRuntimeService,
    AgentBuilderService,
    AgentConfigService,
    AgentRegressionService,
    VoiceSessionService,
    { provide: MODEL_GATEWAY, useFactory: modelGatewayFactory },
    { provide: SPEECH_TO_TEXT, useClass: StubSpeechToText },
    { provide: TEXT_TO_SPEECH, useClass: StubTextToSpeech },
    adSessionRedisProvider,
    AdSessionStore,
    EdgeEventsService,
    AdSessionService,
  ],
})
export class AgentRuntimeModule {}
