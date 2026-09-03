import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsIn, IsOptional, IsString } from 'class-validator';

export class TrackEventDto {
  @ApiProperty({ example: 'ad.click' })
  @IsString()
  type!: string;

  @ApiProperty({ required: false, type: Object, example: { creativeVariantId: 'v1' } })
  @IsOptional()
  @Allow()
  payload?: Record<string, unknown>;
}

export class ImportSpendDto {
  @ApiProperty({ enum: ['google_ads', 'meta', 'generic_export'] })
  @IsIn(['google_ads', 'meta', 'generic_export'])
  provider!: string;

  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsString()
  since!: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsString()
  until!: string;
}
