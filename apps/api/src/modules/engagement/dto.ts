import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class BookDto {
  @ApiProperty({ enum: ['google_calendar', 'microsoft_365'] })
  @IsIn(['google_calendar', 'microsoft_365'])
  provider!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({ example: '2026-09-10T15:00:00Z' })
  @IsString()
  slotStart!: string;

  @ApiProperty({ example: '2026-09-10T15:30:00Z' })
  @IsString()
  slotEnd!: string;

  @ApiProperty({ required: false, default: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class RequestHandoffDto {
  @ApiProperty()
  @IsString()
  conversationId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignHandoffDto {
  @ApiProperty()
  @IsString()
  userId!: string;
}
