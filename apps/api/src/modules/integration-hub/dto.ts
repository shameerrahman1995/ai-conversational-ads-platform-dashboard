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
