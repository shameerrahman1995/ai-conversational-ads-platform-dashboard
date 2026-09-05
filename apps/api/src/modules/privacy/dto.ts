import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PrivacyRequestDto {
  @ApiProperty({ description: 'Data subject: the lead id to export or erase' })
  @IsString()
  leadId!: string;
}
