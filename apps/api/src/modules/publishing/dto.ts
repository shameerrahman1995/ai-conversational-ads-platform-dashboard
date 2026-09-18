import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';

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

export class ChangeVariantDto {
  @ApiProperty({ description: 'The creative variant to bind to this plan (same campaign).' })
  @IsString()
  variantId!: string;
}

export class BulkDeploymentDto {
  @ApiProperty({
    type: [String],
    description: 'Campaign ids to activate/pause in bulk.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: ['activate', 'pause'] })
  @IsIn(['activate', 'pause'])
  action!: 'activate' | 'pause';
}
