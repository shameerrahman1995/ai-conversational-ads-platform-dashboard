import { ApiProperty } from '@nestjs/swagger';

export class RegisterSourceDto {
  @ApiProperty({ enum: ['url', 'pdf', 'feed'] })
  type!: 'url' | 'pdf' | 'feed';

  @ApiProperty({ required: false, description: 'Required for type=url' })
  uri?: string;

  @ApiProperty({ required: false, description: 'Original filename for uploaded files' })
  filename?: string;

  @ApiProperty({ required: false, description: 'MIME type for the signed upload URL' })
  contentType?: string;
}
