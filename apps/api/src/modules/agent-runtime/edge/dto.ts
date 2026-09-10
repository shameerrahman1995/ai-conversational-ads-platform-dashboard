import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Body for `POST /v1/ad-sessions`. */
export class CreateAdSessionDto {
  @ApiProperty({ description: 'CreativeVariant id being served' })
  @IsString()
  creativeId!: string;

  @ApiProperty({ required: false, example: 'google_ads' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({ required: false, description: 'Non-PII placement/context signals' })
  @IsOptional()
  @IsObject()
  placementContext?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Runtime capability snapshot (mic/audio/fetch)' })
  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;
}

/** One funnel/telemetry event in a `/events` batch. */
export class AdSessionEventDto {
  @ApiProperty()
  @IsString()
  type!: string;

  @ApiProperty({ required: false, description: 'Client idempotency key (dedupe-safe)' })
  @IsOptional()
  @IsString()
  dedupeKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

/** Body for `POST /v1/ad-sessions/:id/events`. */
export class IngestEventsDto {
  @ApiProperty({ type: [AdSessionEventDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AdSessionEventDto)
  events!: AdSessionEventDto[];
}

/** Body for `POST /v1/ad-sessions/:id/messages`. */
export class AdSessionMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  text!: string;

  @ApiProperty({ required: false, description: 'Client turn id for message dedupe' })
  @IsOptional()
  @IsString()
  clientEventId?: string;
}

/** Body for `POST /v1/ad-sessions/:id/lead`. */
export class SubmitLeadDto {
  @ApiProperty({ description: 'Captured lead fields (email/phone/fullName/company)' })
  @IsObject()
  fields!: Record<string, string>;

  @ApiProperty({ description: 'Explicit consent — REQUIRED to be true' })
  @IsBoolean()
  consent!: boolean;
}

/** Body for `POST /v1/ad-sessions/:id/action`. */
export class AdSessionActionDto {
  @ApiProperty({ description: 'Allow-listed tool: availability | quote | booking' })
  @IsString()
  type!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
