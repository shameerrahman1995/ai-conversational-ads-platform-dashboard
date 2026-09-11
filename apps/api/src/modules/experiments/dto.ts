import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import type { ArmInput } from './experiments.service';

export class CreateExperimentDto {
  @ApiProperty()
  @IsString()
  campaignId!: string;

  @ApiProperty()
  @IsString()
  hypothesis!: string;

  @ApiProperty({ type: [Object], description: 'Arms: { key, kind: creative|agent, refId, weight? }' })
  @IsArray()
  arms!: ArmInput[];
}

export class AssignDto {
  @ApiProperty({ description: 'Stable subject id (visitor/session) for deterministic assignment' })
  @IsString()
  subjectId!: string;
}

export class ConvertDto {
  @ApiProperty({ description: 'Key of the arm that converted' })
  @IsString()
  armKey!: string;
}

export class DecideDto {
  @ApiProperty({ description: 'Key of the arm being approved as the winner' })
  @IsString()
  winnerKey!: string;
}
