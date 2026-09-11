import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

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
  @IsDateString()
  since!: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsDateString()
  until!: string;
}

/** Query for `GET /v1/analytics/spend` — bad dates now 400 instead of 500. */
export class SpendQueryDto {
  @ApiProperty({ required: false, enum: ['google_ads', 'meta', 'generic_export'] })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ required: false, example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiProperty({ required: false, example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  until?: string;
}

/** Query for `GET /v1/analytics/attribution` — bad dates now 400 instead of 500. */
export class AttributionQueryDto {
  @ApiProperty({ required: false, example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiProperty({ required: false, example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  until?: string;
}
