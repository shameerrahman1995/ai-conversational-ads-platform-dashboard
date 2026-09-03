import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SetBudgetDto {
  @ApiProperty({ example: 500, description: '0 = unlimited' })
  @IsNumber()
  @Min(0)
  monthlyLimitUsd!: number;

  @ApiProperty({ required: false, default: 80 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
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

  // Non-negative to prevent budget-bypass via negative usage.
  @ApiProperty()
  @IsNumber()
  @Min(0)
  units!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  cost!: number;
}
