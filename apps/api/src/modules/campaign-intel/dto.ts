import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { RESTRICTED_VERTICALS } from '@acp/policy';

export class CreateCampaignDto {
  @ApiProperty({ example: 'lead_generation' })
  @IsString()
  objective!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    required: false,
    enum: RESTRICTED_VERTICALS,
    description: 'Restricted vertical (activates the compliance rule pack)',
  })
  @IsOptional()
  @IsIn(RESTRICTED_VERTICALS as unknown as string[])
  vertical?: string;
}

export class GenerateCopyDto {
  @ApiProperty({ required: false, description: 'Copywriter model id (from GET /v1/agents/models)' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false, description: 'Brand voice / tone for generated copy' })
  @IsOptional()
  @IsString()
  brandVoice?: string;
}

export class RegenerateFieldDto {
  @ApiProperty({ enum: ['headline', 'offer', 'cta'] })
  @IsIn(['headline', 'offer', 'cta'])
  field!: 'headline' | 'offer' | 'cta';
}
