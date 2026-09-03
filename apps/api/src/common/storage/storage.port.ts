export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface SignedUpload {
  url: string;
  key: string;
}

export interface StoragePort {
  createSignedUploadUrl(key: string, contentType: string): Promise<SignedUpload>;
  deleteObject(key: string): Promise<void>;
}
