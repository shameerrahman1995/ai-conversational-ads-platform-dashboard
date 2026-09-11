import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
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
  @IsString()
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
