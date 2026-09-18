import { ApiProperty } from '@nestjs/swagger';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const NETWORKS = ['google_ads', 'meta', 'tiktok', 'microsoft', 'amazon_dsp', 'generic_export'];
const TEMPLATES = ['standard_banner', 'carousel_html5', 'playable_basic'];

/** Whitelisted adaptive output formats (bounds the image-gen fan-out). */
const KNOWN_FORMATS = [
  'image_1_1',
  'image_4_5',
  'image_9_16',
  'image_16_9',
  'video',
  'carousel',
  'html5',
  'native_form_schema',
];

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
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsIn(KNOWN_FORMATS, { each: true })
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

/**
 * Persist a Creative Studio blueprint (V10 U3.10). `campaignId` scopes it to a
 * campaign in the caller org; the content trees are free-form JSON columns.
 */
export class CreateBlueprintDto {
  @ApiProperty({ description: 'Campaign this blueprint belongs to' })
  @IsString()
  campaignId!: string;

  @ApiProperty({ required: false, description: 'Optional linked creative variant' })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ required: false, type: Object, description: 'Brief/display metadata' })
  @IsOptional()
  @Allow()
  brief?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [Object], description: 'Strategic directions' })
  @IsOptional()
  @IsArray()
  directions?: unknown[];

  @ApiProperty({ required: false, type: [Object], description: 'Creative blocks' })
  @IsOptional()
  @IsArray()
  blocks?: unknown[];

  @ApiProperty({ required: false, type: [Object], description: 'Journey states' })
  @IsOptional()
  @IsArray()
  states?: unknown[];

  @ApiProperty({ required: false, type: [Object], description: 'Per-placement variants' })
  @IsOptional()
  @IsArray()
  variants?: unknown[];

  @ApiProperty({ required: false, type: Object, description: 'Lock domains { legal, brand, product, user }' })
  @IsOptional()
  @Allow()
  locks?: Record<string, unknown>;

  @ApiProperty({ required: false, type: Object, description: 'Generation provenance' })
  @IsOptional()
  @Allow()
  generation?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Version note' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Save edits to a blueprint (Studio "Save version"). All fields optional. */
export class PatchBlueprintDto {
  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @Allow()
  brief?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  directions?: unknown[];

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  blocks?: unknown[];

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  states?: unknown[];

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  variants?: unknown[];

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @Allow()
  locks?: Record<string, unknown>;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @Allow()
  generation?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Version note' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Review handoff: transition status + attach an approvals payload. */
export class HandoffBlueprintDto {
  @ApiProperty({ enum: ['in_review', 'approved', 'archived'] })
  @IsIn(['in_review', 'approved', 'archived'])
  status!: string;

  @ApiProperty({ required: false, type: Object, description: 'Approvals payload (reviewers, notes, …)' })
  @IsOptional()
  @Allow()
  approvals?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Persist a synthetic-persona simulation trace against a blueprint. */
export class CreateSimulationDto {
  @ApiProperty({ required: false, type: Object, description: 'Synthetic persona' })
  @IsOptional()
  @Allow()
  persona?: Record<string, unknown>;

  @ApiProperty({ required: false, type: Object, description: 'Conditions (network/mic/placement)' })
  @IsOptional()
  @Allow()
  conditions?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [Object], description: 'Ordered event trace' })
  @IsOptional()
  @IsArray()
  events?: unknown[];

  @ApiProperty({ required: false, description: 'Intent score 0–1' })
  @IsOptional()
  @IsNumber()
  intentScore?: number;

  @ApiProperty({ required: false, description: 'Outcome label' })
  @IsOptional()
  @IsString()
  outcome?: string;
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
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  finalUrl!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
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
