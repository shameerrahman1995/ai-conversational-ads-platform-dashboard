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
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** Hard caps for the public, dynamically-keyed lead `fields` record. */
const MAX_LEAD_FIELD_KEYS = 30;
const MAX_LEAD_FIELD_KEY_LENGTH = 64;
const MAX_LEAD_FIELD_VALUE_LENGTH = 1024;

/**
 * Bounds an untrusted `Record<string, string>` submitted from a public creative:
 * the keys are dynamic (per-agent qualification) so they can't be rigidly typed,
 * but the record must stay small — at most 30 keys, each key <= 64 chars, and
 * each value a string <= 1024 chars — to stop lead-field abuse / payload bloat.
 * Object-ness / presence is enforced by @IsObject on the property itself.
 */
@ValidatorConstraint({ name: 'boundedStringRecord', async: false })
class BoundedStringRecordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true; // @IsObject handles presence
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_LEAD_FIELD_KEYS) return false;
    for (const [key, val] of entries) {
      if (key.length > MAX_LEAD_FIELD_KEY_LENGTH) return false;
      if (typeof val !== 'string' || val.length > MAX_LEAD_FIELD_VALUE_LENGTH) return false;
    }
    return true;
  }

  defaultMessage(): string {
    return `fields must be an object of at most ${MAX_LEAD_FIELD_KEYS} keys (each key <= ${MAX_LEAD_FIELD_KEY_LENGTH} chars, each value a string <= ${MAX_LEAD_FIELD_VALUE_LENGTH} chars)`;
  }
}

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
  @Validate(BoundedStringRecordConstraint)
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
