import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryDto {
  @ApiProperty({ example: 'What is the pricing?' })
  @IsString()
  query!: string;

  @ApiProperty({ required: false, default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  k?: number;
}
