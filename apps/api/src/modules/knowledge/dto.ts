import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryDto {
  @ApiProperty({ example: 'What is the pricing?' })
  @IsString()
  query!: string;

  @ApiProperty({ required: false, default: 5 })
  @IsOptional()
  @IsNumber()
  k?: number;
}
