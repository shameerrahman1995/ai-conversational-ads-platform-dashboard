import { ApiProperty } from '@nestjs/swagger';
import type { UserRole } from '@acp/shared-types';

export class CreateOrgDto {
  @ApiProperty({ example: 'Acme Corp' })
  name!: string;

  @ApiProperty({ required: false, default: 'us' })
  region?: string;
}

export class InviteUserDto {
  @ApiProperty({ example: 'person@acme.com' })
  email!: string;

  @ApiProperty({ enum: ['creator', 'reviewer', 'publisher', 'analyst', 'admin'] })
  role!: UserRole;
}
