import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadEnv } from '@acp/config';
import type { SignedUpload, StoragePort } from './storage.port';

/** S3/MinIO-backed storage. Uploads use short-lived presigned PUT URLs so the
 *  browser never sees credentials (blueprint §12). */
@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly env = loadEnv();
  private readonly client = new S3Client({
    region: this.env.S3_REGION,
    endpoint: this.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials:
      this.env.S3_ACCESS_KEY_ID && this.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: this.env.S3_ACCESS_KEY_ID,
            secretAccessKey: this.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  async createSignedUploadUrl(key: string, contentType: string): Promise<SignedUpload> {
    const cmd = new PutObjectCommand({
      Bucket: this.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: 900 });
    return { url, key };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }
}
