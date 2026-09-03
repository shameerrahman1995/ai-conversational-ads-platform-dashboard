import { ApiProperty } from '@nestjs/swagger';
import type { ConsentType, QualificationLevel } from '@acp/shared-types';

export class CreateLeadDto {
  @ApiProperty({ required: false })
  conversationId?: string;

  @ApiProperty({ type: Object, example: { email: 'a@b.com', fullName: 'Ada' } })
  fields!: { email?: string; phone?: string; fullName?: string; company?: string };

  @ApiProperty({ required: false, type: Object })
  fieldSources?: Record<string, string>;

  @ApiProperty({ required: false, type: [Object] })
  consents?: Array<{ type: ConsentType; granted: boolean; disclosureVersion: string }>;

  @ApiProperty({ required: false, enum: ['low', 'medium', 'high'] })
  qualificationLevel?: QualificationLevel;

  @ApiProperty({ required: false })
  agentSummary?: string;
}

export class AssignDto {
  @ApiProperty()
  ownerId!: string;
}

export class StatusDto {
  @ApiProperty()
  lifecycleStage!: string;
}

export class MergeDto {
  @ApiProperty()
  sourceId!: string;

  @ApiProperty()
  targetId!: string;
}
