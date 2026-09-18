import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type { UserRole } from '@acp/shared-types';

/** The Prisma `UserRole` enum, as a runtime tuple for validation. */
export const USER_ROLES = ['creator', 'reviewer', 'publisher', 'analyst', 'admin'] as const;

export class CreateOrgDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  name!: string;

  @ApiProperty({ required: false, default: 'us' })
  @IsOptional()
  @IsString()
  region?: string;
}

export class InviteUserDto {
  @ApiProperty({ example: 'person@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: USER_ROLES })
  @IsIn(USER_ROLES)
  role!: UserRole;
}

export class ChangeUserRoleDto {
  @ApiProperty({ enum: USER_ROLES })
  @IsIn(USER_ROLES)
  role!: UserRole;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, description: 'New password (min 8 chars); hashed server-side, never stored in plaintext.' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class UpdateOrgProfileDto {
  @ApiProperty({ required: false, example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: 'us' })
  @IsOptional()
  @IsString()
  region?: string;
}

/**
 * Workspace update (Settings §U7.1). Name/region plus the flexible `settings`
 * (currency/timezone/region defaults, feature flags) and `branding` (logo,
 * accent) JSON blobs. `plan` and `status` are platform-admin controlled and are
 * never accepted here. Provided JSON blobs are shallow-merged server-side so a
 * partial patch never wipes sibling keys.
 */
export class UpdateWorkspaceDto {
  @ApiProperty({ required: false, example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: 'us' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({
    required: false,
    description: 'Workspace defaults (currency, timezone, feature flags). Shallow-merged.',
    example: { currency: 'USD', timezone: 'America/New_York' },
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Branding (logoUrl, accent hex). Shallow-merged.',
    example: { logoUrl: 'https://…/logo.png', accent: '#4f46e5' },
  })
  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;
}

/**
 * Danger-zone: request an ownership transfer. Records intent + audits; it does
 * NOT actually reassign ownership (that is a platform-admin/offline step).
 */
export class TransferOrgDto {
  @ApiProperty({ description: 'Email of the proposed new workspace owner.' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, description: 'Optional note recorded with the transfer request.' })
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Danger-zone: delete/close the workspace. Requires a typed confirmation token
 * that must echo the workspace name exactly. Suspends (reversibly) rather than
 * cascade-deleting tenant data. Audited.
 */
export class DeleteOrgDto {
  @ApiProperty({ description: 'Must exactly match the workspace name to confirm.' })
  @IsString()
  confirm!: string;
}
