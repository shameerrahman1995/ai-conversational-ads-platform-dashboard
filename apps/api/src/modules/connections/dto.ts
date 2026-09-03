import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CompleteAuthDto {
  @ApiProperty({ description: 'OAuth authorization code returned by the provider' })
  @IsString()
  code!: string;
}
