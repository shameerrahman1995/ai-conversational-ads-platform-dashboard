import { ApiProperty } from '@nestjs/swagger';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const NETWORKS = ['google_ads', 'meta', 'tiktok', 'microsoft', 'amazon_dsp', 'generic_export'];
const TEMPLATES = ['standard_banner', 'carousel_html5', 'playable_basic'];

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

/**
 * Generate a full CreativeBlueprint from a natural-language brief.
 * The brief must be at least 12 characters so there is something to plan against.
 */
export class GenerateBlueprintDto {
  @ApiProperty({ description: 'Natural-language campaign brief (min 12 chars)' })
  @IsString()
  @MinLength(12, { message: 'A campaign brief of at least 12 characters is required.' })
  prompt!: string;

  @ApiProperty({ required: false, description: 'Explicit product/brand name' })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiProperty({ required: false, description: 'Desired campaign outcome' })
  @IsOptional()
  @IsString()
  outcome?: string;

  @ApiProperty({ required: false, description: 'Target audience' })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({ required: false, description: 'Brand tone' })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiProperty({ required: false, description: 'Primary benefit to lead with' })
  @IsOptional()
  @IsString()
  primaryBenefit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cta?: string;

  @ApiProperty({ required: false, description: 'Legal disclaimer text' })
  @IsOptional()
  @IsString()
  disclaimer?: string;

  @ApiProperty({ required: false, example: '#6d5dfc' })
  @IsOptional()
  @Matches(HEX)
  accent?: string;

  @ApiProperty({ required: false, example: '#0c1120' })
  @IsOptional()
  @Matches(HEX)
  background?: string;
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
  @ApiProperty({ enum: TEMPLATES })
  @IsIn(TEMPLATES)
  template!: string;

  @ApiProperty({ description: 'Inline HTML5 bundle source' })
  @IsString()
  html!: string;

  @ApiProperty({ enum: NETWORKS })
  @IsString()
  network!: string;
}

export class CreativeSizeDto {
  @ApiProperty({ example: 300 })
  @IsInt()
  width!: number;

  @ApiProperty({ example: 250 })
  @IsInt()
  height!: number;
}

export class CreativeFeaturesDto {
  @ApiProperty()
  @IsBoolean()
  textChat!: boolean;

  @ApiProperty({ enum: ['off', 'runtime_detect', 'on'] })
  @IsIn(['off', 'runtime_detect', 'on'])
  voice!: string;

  @ApiProperty()
  @IsBoolean()
  gallery!: boolean;

  @ApiProperty()
  @IsBoolean()
  leadCapture!: boolean;
}

export class BundleCopyDto {
  @ApiProperty({ description: 'Product/brand name' })
  @IsString()
  productName!: string;

  @ApiProperty({ description: 'Primary hook headline' })
  @IsString()
  hook!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subhead?: string;

  @ApiProperty({ required: false, description: 'Primary CTA label (default "Explore")' })
  @IsOptional()
  @IsString()
  ctaLabel?: string;

  @ApiProperty({ required: false, description: 'AI button label (default "Ask AI")' })
  @IsOptional()
  @IsString()
  askAiLabel?: string;

  @ApiProperty({ description: 'Clickthrough / fallback URL' })
  @IsString()
  finalUrl!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  privacyUrl?: string;
}

/**
 * Compile a REAL HTML5 ad ZIP. Carries the CreativeManifest fields (secret-free
 * except the public-scope signed token) plus the copy the template renders.
 */
export class CompileBundleDto {
  @ApiProperty({ enum: TEMPLATES })
  @IsIn(TEMPLATES)
  template!: string;

  @ApiProperty({ enum: NETWORKS })
  @IsString()
  network!: string;

  @ApiProperty()
  @IsString()
  creativeId!: string;

  @ApiProperty()
  @IsString()
  tenantId!: string;

  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty()
  @IsString()
  agentId!: string;

  @ApiProperty({ type: CreativeSizeDto })
  @ValidateNested()
  @Type(() => CreativeSizeDto)
  size!: CreativeSizeDto;

  @ApiProperty({ enum: ['interactive_ai', 'static'] })
  @IsIn(['interactive_ai', 'static'])
  mode!: string;

  @ApiProperty({ type: CreativeFeaturesDto })
  @ValidateNested()
  @Type(() => CreativeFeaturesDto)
  features!: CreativeFeaturesDto;

  @ApiProperty({ type: [String], description: 'Whitelisted creative actions' })
  @IsArray()
  @IsString({ each: true })
  allowedActions!: string[];

  @ApiProperty({ description: 'Platform Edge API base URL' })
  @IsString()
  edgeApiBase!: string;

  @ApiProperty({ description: 'Public-scope, rotatable signed creative token' })
  @IsString()
  signedCreativeToken!: string;

  @ApiProperty({ type: BundleCopyDto })
  @ValidateNested()
  @Type(() => BundleCopyDto)
  copy!: BundleCopyDto;
}
