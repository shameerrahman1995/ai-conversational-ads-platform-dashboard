import { Global, Module } from '@nestjs/common';
import { MALWARE_SCANNER } from './scanner.port';
import { DevMalwareScanner } from './dev-scanner';

@Global()
@Module({
  providers: [{ provide: MALWARE_SCANNER, useClass: DevMalwareScanner }],
  exports: [MALWARE_SCANNER],
})
export class ScannerModule {}
