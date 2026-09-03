import { ApiProperty } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty({ example: 'lead_generation' })
  objective!: string;

  @ApiProperty({ required: false })
  name?: string;
}

export class RegenerateFieldDto {
  @ApiProperty({ enum: ['headline', 'offer', 'cta'] })
  field!: 'headline' | 'offer' | 'cta';
}
