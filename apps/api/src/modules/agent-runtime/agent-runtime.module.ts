import { Module } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentBuilderService } from './agent-builder.service';
import { AgentController } from './agent.controller';
import { AgentSessionController } from './agent-session.controller';
import { MODEL_GATEWAY } from './model-gateway.port';
import { StubModelGateway } from './stub-model-gateway';

// Hosted conversational agent (blueprint §16): builder, eval-gated publish, runtime.
@Module({
  controllers: [AgentController, AgentSessionController],
  providers: [
    AgentRuntimeService,
    AgentBuilderService,
    { provide: MODEL_GATEWAY, useClass: StubModelGateway },
  ],
})
export class AgentRuntimeModule {}
