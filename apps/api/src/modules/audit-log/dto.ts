import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query for `GET /v1/platform/audit` — the cross-tenant audit explorer. Every
 * field is optional: with none set the endpoint reads audit events across ALL
 * orgs (newest first, capped). Filters are opt-in and narrow that view.
 */
export class PlatformAuditQueryDto {
  @ApiProperty({ required: false, description: 'Max rows (default 100, max 1000)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false, description: 'Narrow to a single tenant (org id)' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiProperty({ required: false, description: 'Prefix match on the action string, e.g. "platform."' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({ required: false, description: 'Exact actor id' })
  @IsOptional()
  @IsString()
  actorId?: string;
}
