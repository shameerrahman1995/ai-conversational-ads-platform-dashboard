export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

export interface MalwareScannerPort {
  scan(key: string): Promise<{ clean: boolean }>;
}
