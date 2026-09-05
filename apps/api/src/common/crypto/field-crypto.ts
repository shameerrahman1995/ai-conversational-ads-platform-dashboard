import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for PII at rest (AES-256-GCM, Node built-in).
 * Stored format: `enc:v1:<ivB64>:<tagB64>:<cipherB64>`. Values that are not in
 * this format are returned as-is (backward compatible with existing plaintext),
 * so callers can wrap reads/writes without a data migration.
 *
 * Key: FIELD_ENCRYPTION_KEY (hex/base64, ≥32 bytes) in production; a derived dev
 * key otherwise so the pipeline works locally. Rotate by versioning the prefix.
 */
const PREFIX = 'enc:v1:';

function key(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (raw && raw.length >= 32) {
    // Accept hex or base64 or raw; normalize to 32 bytes via SHA-256.
    return createHash('sha256').update(raw).digest();
  }
  // Dev fallback — NOT for production (env schema requires the key in prod).
  return createHash('sha256').update('acp-dev-field-key').digest();
}

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  try {
    const [, , ivB64, tagB64, ctB64] = stored.split(':');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '[decryption failed]';
  }
}
