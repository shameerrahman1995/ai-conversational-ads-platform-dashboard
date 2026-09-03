import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsIn, IsOptional, IsString } from 'class-validator';
import type { ConsentType, QualificationLevel } from '@acp/shared-types';

export class CreateLeadDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({ type: Object, example: { email: 'a@b.com', fullName: 'Ada' } })
  @Allow()
  fields!: { email?: string; phone?: string; fullName?: string; company?: string };

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @Allow()
  fieldSources?: Record<string, string>;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @Allow()
  consents?: Array<{ type: ConsentType; granted: boolean; disclosureVersion: string }>;

  @ApiProperty({ required: false, enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  qualificationLevel?: QualificationLevel;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  agentSummary?: string;
}

export class AssignDto {
  @ApiProperty()
  @IsString()
  ownerId!: string;
}

export class StatusDto {
  @ApiProperty()
  @IsString()
  lifecycleStage!: string;
}

export class MergeDto {
  @ApiProperty()
  @IsString()
  sourceId!: string;

  @ApiProperty()
  @IsString()
  targetId!: string;
}
