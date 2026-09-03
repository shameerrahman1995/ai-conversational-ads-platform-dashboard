import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class DeliverDto {
  @ApiProperty({ enum: ['webhook', 'hubspot', 'zoho'] })
  @IsIn(['webhook', 'hubspot', 'zoho'])
  provider!: string;
}

export class CreateMappingDto {
  @ApiProperty({ enum: ['webhook', 'hubspot', 'zoho'] })
  @IsIn(['webhook', 'hubspot', 'zoho'])
  provider!: string;

  @ApiProperty({ example: 'contact.email.value' })
  @IsString()
  from!: string;

  @ApiProperty({ example: 'email' })
  @IsString()
  to!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiProperty({ required: false, enum: ['none', 'lowercase', 'e164'] })
  @IsOptional()
  @IsIn(['none', 'lowercase', 'e164'])
  transform?: string;
}

export class StageChangeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty({ required: false, description: 'Remote CRM record id (if leadId unknown)' })
  @IsOptional()
  @IsString()
  crmId?: string;

  @ApiProperty({ example: 'qualified' })
  @IsString()
  stage!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  revenue?: number;
}
