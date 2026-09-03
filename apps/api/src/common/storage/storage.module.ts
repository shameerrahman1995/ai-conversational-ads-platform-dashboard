import { Global, Module } from '@nestjs/common';
import { STORAGE_PORT } from './storage.port';
import { S3StorageAdapter } from './s3-storage.adapter';

@Global()
@Module({
  providers: [{ provide: STORAGE_PORT, useClass: S3StorageAdapter }],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
