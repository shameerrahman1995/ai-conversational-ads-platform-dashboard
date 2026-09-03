import { ApiProperty } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty()
  campaignId!: string;

  @ApiProperty()
  variantId!: string;

  @ApiProperty({ enum: ['google_ads', 'meta', 'generic_export'] })
  platform!: string;

  @ApiProperty()
  accountId!: string;
}
