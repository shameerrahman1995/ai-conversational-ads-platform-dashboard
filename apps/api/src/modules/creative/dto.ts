import { ApiProperty } from '@nestjs/swagger';

export class CreateVariantDto {
  @ApiProperty({ example: 'image_1_1' })
  format!: string;

  @ApiProperty({ type: Object, description: 'Creative spec (copy, assets, layout)' })
  spec!: unknown;
}
