import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'srahman@hodos360.ai' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo1234' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ required: false, description: 'TOTP code — required when the account has MFA enabled' })
  @IsOptional()
  @IsString()
  code?: string;
}

/** Password step-up to begin MFA enrollment. */
export class EnrollMfaDto {
  @ApiProperty({ description: 'Account password (re-authentication for this sensitive change)' })
  @IsString()
  @MinLength(6)
  password!: string;
}

/** A 6-digit TOTP code + password step-up (MFA enable/disable). */
export class MfaVerifyDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @ApiProperty({ description: 'Account password (re-authentication for this sensitive change)' })
  @IsString()
  @MinLength(6)
  password!: string;
}
