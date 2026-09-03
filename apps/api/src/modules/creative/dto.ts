import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsString } from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({ example: 'image_1_1' })
  @IsString()
  format!: string;

  @ApiProperty({ type: Object, description: 'Creative spec (copy, assets, layout)' })
  @Allow()
  spec!: unknown;
}
