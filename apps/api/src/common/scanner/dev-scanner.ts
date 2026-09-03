import { Injectable } from '@nestjs/common';
import type { MalwareScannerPort } from './scanner.port';

/** DEV STUB: always clean. Replace with ClamAV/service scan later. */
@Injectable()
export class DevMalwareScanner implements MalwareScannerPort {
  async scan(_key: string): Promise<{ clean: boolean }> {
    return { clean: true };
  }
}
