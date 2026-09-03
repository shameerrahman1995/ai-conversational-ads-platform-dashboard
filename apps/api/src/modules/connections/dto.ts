import { ApiProperty } from '@nestjs/swagger';

export class CompleteAuthDto {
  @ApiProperty({ description: 'OAuth authorization code returned by the provider' })
  code!: string;
}
