import { Module } from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import { AudiencesController } from './audiences.controller';

// Audiences (V10 U2.2): reusable segment + personalization definitions.
@Module({
  controllers: [AudiencesController],
  providers: [AudiencesService],
})
export class AudiencesModule {}
