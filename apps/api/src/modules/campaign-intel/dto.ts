import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ example: 'lead_generation' })
  @IsString()
  objective!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;
}

export class RegenerateFieldDto {
  @ApiProperty({ enum: ['headline', 'offer', 'cta'] })
  @IsIn(['headline', 'offer', 'cta'])
  field!: 'headline' | 'offer' | 'cta';
}
