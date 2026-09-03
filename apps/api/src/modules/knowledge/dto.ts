import { ApiProperty } from '@nestjs/swagger';

export class QueryDto {
  @ApiProperty({ example: 'What is the pricing?' })
  query!: string;

  @ApiProperty({ required: false, default: 5 })
  k?: number;
}
