import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsArray, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const HEX = /^#[0-9a-fA-F]{3,8}$/;

export class PaletteDto {
  @ApiProperty({ example: '#0f1729' })
  @Matches(HEX)
  bg!: string;

  @ApiProperty({ example: '#4f46e5' })
  @Matches(HEX)
  accent!: string;

  @ApiProperty({ example: '#ffffff' })
  @Matches(HEX)
  text!: string;
}

export class CreateVariantDto {
  @ApiProperty({ example: 'image_1_1' })
  @IsString()
  format!: string;

  @ApiProperty({ type: Object, description: 'Creative spec (copy, assets, layout)' })
  @Allow()
  spec!: unknown;
}

export class GenerateAdaptiveDto {
  @ApiProperty({ required: false, description: 'Short brief describing the ad' })
  @IsOptional()
  @IsString()
  brief?: string;

  @ApiProperty({ type: [String], description: 'Formats to produce (e.g. image_1_1, image_9_16)' })
  @IsArray()
  formats!: string[];

  @ApiProperty({ required: false, enum: ['image', 'video', 'audio', 'none'] })
  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'none'])
  mediaType?: 'image' | 'video' | 'audio' | 'none';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brandVoice?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;
}

export class GenerateImageDto {
  @ApiProperty({ description: 'Prompt describing the image to generate' })
  @IsString()
  prompt!: string;

  @ApiProperty({ required: false, example: 'image_1_1' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiProperty({ required: false, description: 'Sub-line rendered under the headline' })
  @IsOptional()
  @IsString()
  subhead?: string;

  @ApiProperty({ required: false, type: PaletteDto, description: 'Palette { bg, accent, text } (hex)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaletteDto)
  palette?: PaletteDto;
}

export class UpdateVariantDto {
  @ApiProperty({ required: false, type: Object, description: 'Spec fields to merge' })
  @IsOptional()
  @Allow()
  spec?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;
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
