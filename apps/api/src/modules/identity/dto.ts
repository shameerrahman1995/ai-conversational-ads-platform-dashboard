import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { UserRole } from '@acp/shared-types';

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

  @ApiProperty({ enum: ['creator', 'reviewer', 'publisher', 'analyst', 'admin'] })
  @IsIn(['creator', 'reviewer', 'publisher', 'analyst', 'admin'])
  role!: UserRole;
}
