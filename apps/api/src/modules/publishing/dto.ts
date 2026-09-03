import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  campaignId!: string;

  @ApiProperty()
  @IsString()
  variantId!: string;

  @ApiProperty({
    enum: ['google_ads', 'meta', 'generic_export', 'tiktok', 'microsoft', 'amazon_dsp', 'linkedin'],
  })
  @IsIn(['google_ads', 'meta', 'generic_export', 'tiktok', 'microsoft', 'amazon_dsp', 'linkedin'])
  platform!: string;

  @ApiProperty()
  @IsString()
  accountId!: string;
}
