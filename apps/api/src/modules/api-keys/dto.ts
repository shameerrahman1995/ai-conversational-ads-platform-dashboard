import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI deploy key' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
