import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'srahman@hodos360.ai' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo1234' })
  @IsString()
  @MinLength(6)
  password!: string;
}
