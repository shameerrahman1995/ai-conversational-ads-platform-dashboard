import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsIn, IsString } from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({ example: 'image_1_1' })
  @IsString()
  format!: string;

  @ApiProperty({ type: Object, description: 'Creative spec (copy, assets, layout)' })
  @Allow()
  spec!: unknown;
}

export class CompileHtml5Dto {
  @ApiProperty({ enum: ['standard_banner', 'carousel_html5', 'playable_basic'] })
  @IsIn(['standard_banner', 'carousel_html5', 'playable_basic'])
  template!: string;

  @ApiProperty({ description: 'Inline HTML5 bundle source' })
  @IsString()
  html!: string;

  @ApiProperty({ enum: ['google_ads', 'meta', 'tiktok', 'microsoft', 'amazon_dsp', 'generic_export'] })
  @IsString()
  network!: string;
}
