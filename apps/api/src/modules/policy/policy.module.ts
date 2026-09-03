import { Global, Module } from '@nestjs/common';
import { PolicyService } from './policy.service';

// Policy: content safety, restricted-vertical rule packs & compliance gating.
// Global so any module (publishing, agent runtime, …) can inject the gate.
@Global()
@Module({
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
