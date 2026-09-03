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

export class RegenerateFieldDto {
  @ApiProperty({ enum: ['headline', 'offer', 'cta'] })
  @IsIn(['headline', 'offer', 'cta'])
  field!: 'headline' | 'offer' | 'cta';
}
