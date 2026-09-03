import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

// Health: liveness/readiness probe endpoints for the API service.
@Module({ controllers: [HealthController] })
export class HealthModule {}
