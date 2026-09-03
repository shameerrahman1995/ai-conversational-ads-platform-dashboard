/**
 * HTML5 / playable static analysis (blueprint §14/§17): template allowlist, no
 * arbitrary/dangerous JS, no external network calls where the network forbids it
 * (e.g. TikTok playable, Amazon), no device APIs, and per-network size limits.
 * Compiled creatives render in a sandboxed, CSP-locked iframe.
 */
export const ALLOWED_TEMPLATES = ['standard_banner', 'carousel_html5', 'playable_basic'];

export interface Html5Issue {
  code: string;
  message: string;
}

export interface Html5Analysis {
  ok: boolean;
  issues: Html5Issue[];
  sizeBytes: number;
}

const NO_EXTERNAL_NETWORKS = ['tiktok', 'amazon_dsp'];

export function isAllowedTemplate(template: string): boolean {
  return ALLOWED_TEMPLATES.includes(template);
}

export function analyzeHtml5(
  html: string,
  opts: { network: string; maxBytes?: number },
): Html5Analysis {
  const issues: Html5Issue[] = [];
  const sizeBytes = Buffer.byteLength(html, 'utf8');
  const maxBytes = opts.maxBytes ?? (opts.network === 'google_ads' ? 600_000 : 5_000_000);
  if (sizeBytes > maxBytes) {
    issues.push({ code: 'oversize', message: `bundle ${sizeBytes} exceeds ${maxBytes} bytes` });
  }

  const hasExternal =
    /(?:src|href)\s*=\s*["']https?:\/\//i.test(html) ||
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i.test(html);
  if (hasExternal && NO_EXTERNAL_NETWORKS.includes(opts.network)) {
    issues.push({ code: 'external_request', message: `external network calls are prohibited for ${opts.network}` });
  }

  if (/getUserMedia|navigator\.mediaDevices|navigator\.geolocation/i.test(html)) {
    issues.push({ code: 'device_api', message: 'device APIs (camera/mic/geolocation) are prohibited' });
  }

  if (/\beval\s*\(|document\.write\s*\(|new Function\s*\(/i.test(html)) {
    issues.push({ code: 'unsafe_js', message: 'eval / document.write / new Function are not allowed' });
  }

  return { ok: issues.length === 0, issues, sizeBytes };
}

/** CSP for the isolated preview iframe: no external anything, inline assets only. */
export function buildPreviewCsp(): string {
  return "default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'self'";
}

/** Sandbox attributes for the preview iframe (no same-origin, no top navigation). */
export const PREVIEW_SANDBOX = 'allow-scripts';
