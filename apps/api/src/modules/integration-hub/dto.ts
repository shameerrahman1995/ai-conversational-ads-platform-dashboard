import { ApiProperty } from '@nestjs/swagger';

export class DeliverDto {
  @ApiProperty({ enum: ['webhook', 'hubspot', 'zoho'] })
  provider!: string;
}

export class CreateMappingDto {
  @ApiProperty({ enum: ['webhook', 'hubspot', 'zoho'] })
  provider!: string;

  @ApiProperty({ example: 'contact.email.value' })
  from!: string;

  @ApiProperty({ example: 'email' })
  to!: string;

  @ApiProperty({ required: false })
  required?: boolean;

  @ApiProperty({ required: false, enum: ['none', 'lowercase', 'e164'] })
  transform?: string;
}

export class StageChangeDto {
  @ApiProperty({ required: false })
  leadId?: string;

  @ApiProperty({ required: false, description: 'Remote CRM record id (if leadId unknown)' })
  crmId?: string;

  @ApiProperty({ example: 'qualified' })
  stage!: string;

  @ApiProperty({ required: false })
  revenue?: number;
}
