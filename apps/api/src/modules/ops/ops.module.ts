import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';

/**
 * Ops / SRE surface (Wave 3, P2 reliability): dead-letter-queue visibility and
 * replay. The controller injects JobsAdminService, which the global JobsModule
 * exports, so no providers are declared here.
 */
@Module({
  controllers: [OpsController],
})
export class OpsModule {}
