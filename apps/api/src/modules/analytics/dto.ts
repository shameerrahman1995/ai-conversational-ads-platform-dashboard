import { ApiProperty } from '@nestjs/swagger';

export class TrackEventDto {
  @ApiProperty({ example: 'ad.click' })
  type!: string;

  @ApiProperty({ required: false, type: Object, example: { creativeVariantId: 'v1' } })
  payload?: Record<string, unknown>;
}

export class ImportSpendDto {
  @ApiProperty({ enum: ['google_ads', 'meta', 'generic_export'] })
  provider!: string;

  @ApiProperty()
  accountId!: string;

  @ApiProperty({ example: '2026-09-01' })
  since!: string;

  @ApiProperty({ example: '2026-09-30' })
  until!: string;
}
