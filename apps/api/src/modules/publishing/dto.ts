import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  campaignId!: string;

  @ApiProperty()
  @IsString()
  variantId!: string;

  @ApiProperty({ enum: ['google_ads', 'meta', 'generic_export'] })
  @IsIn(['google_ads', 'meta', 'generic_export'])
  platform!: string;

  @ApiProperty()
  @IsString()
  accountId!: string;
}
