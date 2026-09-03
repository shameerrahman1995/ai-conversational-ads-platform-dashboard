import { Injectable } from '@nestjs/common';
import type { MalwareScannerPort } from './scanner.port';

/**
 * DEV STUB: reports clean in development/test so the ingestion pipeline is
 * exercisable without a real scanner. It FAILS CLOSED in production — rather than
 * silently approving unscanned files, it throws, so file-source parsing is
 * refused until a real scanner (ClamAV/service) is wired behind this port.
 */
@Injectable()
export class DevMalwareScanner implements MalwareScannerPort {
  async scan(_key: string): Promise<{ clean: boolean }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'No malware scanner is configured; refusing to mark content clean in production.',
      );
    }
    return { clean: true };
  }
}
