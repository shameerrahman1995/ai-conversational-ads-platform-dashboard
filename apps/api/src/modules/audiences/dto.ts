import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** An audience is either a targetable segment or a personalization rule. */
export type AudienceKind = 'segment' | 'personalization';
export const AUDIENCE_KINDS: AudienceKind[] = ['segment', 'personalization'];

export class CreateAudienceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: AUDIENCE_KINDS })
  @IsIn(AUDIENCE_KINDS)
  kind!: AudienceKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    type: Object,
    description: 'Provider-neutral definition blob (conditions, geos, interests, channels, signals…).',
  })
  @IsObject()
  definition!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Cached reach estimate.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedSize?: number;
}

export class UpdateAudienceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Cached reach estimate.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedSize?: number;
}

export class ListAudiencesQueryDto {
  @ApiPropertyOptional({ enum: AUDIENCE_KINDS, description: 'Filter to one kind.' })
  @IsOptional()
  @IsIn(AUDIENCE_KINDS)
  kind?: AudienceKind;
}
