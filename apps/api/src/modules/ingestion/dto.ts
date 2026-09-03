import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class RegisterSourceDto {
  @ApiProperty({ enum: ['url', 'pdf', 'feed'] })
  @IsIn(['url', 'pdf', 'feed'])
  type!: 'url' | 'pdf' | 'feed';

  @ApiProperty({ required: false, description: 'Required for type=url' })
  @IsOptional()
  @IsString()
  uri?: string;

  @ApiProperty({ required: false, description: 'Original filename for uploaded files' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiProperty({ required: false, description: 'MIME type for the signed upload URL' })
  @IsOptional()
  @IsString()
  contentType?: string;
}
