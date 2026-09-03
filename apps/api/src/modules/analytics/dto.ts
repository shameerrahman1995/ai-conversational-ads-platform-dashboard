import { ApiProperty } from '@nestjs/swagger';

export class TrackEventDto {
  @ApiProperty({ example: 'ad.click' })
  type!: string;

  @ApiProperty({ required: false, type: Object, example: { creativeVariantId: 'v1' } })
  payload?: Record<string, unknown>;
}
