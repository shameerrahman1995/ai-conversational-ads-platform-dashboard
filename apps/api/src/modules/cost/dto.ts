import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class SetBudgetDto {
  @ApiProperty({ example: 500 })
  @IsNumber()
  monthlyLimitUsd!: number;

  @ApiProperty({ required: false, default: 80 })
  @IsOptional()
  @IsNumber()
  alertThresholdPct?: number;
}

export class RecordUsageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ enum: ['model', 'voice'] })
  @IsIn(['model', 'voice'])
  kind!: string;

  @ApiProperty()
  @IsNumber()
  units!: number;

  @ApiProperty()
  @IsNumber()
  cost!: number;
}
