import { ApiProperty } from '@nestjs/swagger';
import type { ArmInput } from './experiments.service';

export class CreateExperimentDto {
  @ApiProperty()
  campaignId!: string;

  @ApiProperty()
  hypothesis!: string;

  @ApiProperty({ type: [Object], description: 'Arms: { key, kind: creative|agent, refId, weight? }' })
  arms!: ArmInput[];
}

export class AssignDto {
  @ApiProperty({ description: 'Stable subject id (visitor/session) for deterministic assignment' })
  subjectId!: string;
}
