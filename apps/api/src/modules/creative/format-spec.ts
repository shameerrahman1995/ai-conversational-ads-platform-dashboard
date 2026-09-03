/** Platform-agnostic creative format specs + output validation (blueprint §10). */

export interface FormatSpec {
  width?: number;
  height?: number;
  maxBytes?: number;
}

export const FORMAT_SPECS: Record<string, FormatSpec> = {
  image_1_1: { width: 1080, height: 1080 },
  image_4_5: { width: 1080, height: 1350 },
  image_9_16: { width: 1080, height: 1920 },
  video: { maxBytes: 50_000_000 },
  html5: { maxBytes: 600_000 }, // Google display upload bundle limit
};

export interface RenderOutput {
  format: string;
  width?: number;
  height?: number;
  bytes: number;
  storageKey: string;
}

export interface ValidationIssue {
  format: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateOutputs(outputs: RenderOutput[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const o of outputs) {
    const spec = FORMAT_SPECS[o.format];
    if (!spec) {
      issues.push({ format: o.format, code: 'unknown_format', message: `No spec for ${o.format}` });
      continue;
    }
    if (spec.width && o.width !== spec.width) {
      issues.push({ format: o.format, code: 'bad_width', message: `expected width ${spec.width}` });
    }
    if (spec.height && o.height !== spec.height) {
      issues.push({
        format: o.format,
        code: 'bad_height',
        message: `expected height ${spec.height}`,
      });
    }
    if (spec.maxBytes && o.bytes > spec.maxBytes) {
      issues.push({ format: o.format, code: 'oversize', message: `exceeds ${spec.maxBytes} bytes` });
    }
  }
  return { ok: issues.length === 0, issues };
}
