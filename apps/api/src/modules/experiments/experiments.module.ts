import { Module } from '@nestjs/common';
import { ExperimentsService } from './experiments.service';
import { ExperimentsController } from './experiments.controller';

// Experiments (blueprint §3/§6): creative + agent A/B with weighted assignment.
@Module({
  controllers: [ExperimentsController],
  providers: [ExperimentsService],
})
export class ExperimentsModule {}
