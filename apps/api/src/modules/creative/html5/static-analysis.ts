/**
 * HTML5 / playable static analysis (blueprint §14/§17). Replaces the previous
 * regex-only scan (which was trivially bypassable) with an AST walk (parse5) plus
 * an explicit per-network external-resource policy and a secret scanner:
 *
 *  - Template allowlist.
 *  - No external network references where the network requires a self-contained
 *    bundle. Verified 2026-09-11 (docs/platform-verification/*): TikTok playables
 *    and Meta playables MUST make no external requests; Google uploaded HTML5
 *    allows NO external references except a small Google-hosted library allowlist.
 *  - No device APIs (camera/mic/geolocation) — not permitted in ad creatives.
 *  - No dangerous JS (eval / Function / document.write / innerHTML / string timers).
 *  - No secrets/tokens in the bundle (master rule 4: never ship secrets in creative).
 *  - Per-network size limits.
 *
 * The AST walk inspects every URL-bearing attribute, `<script>/<link>/<iframe>/
 * <object>/<embed>` resources, inline `on*` event handlers, and CSS `url()` /
 * `@import` — closing the protocol-relative, CSS-url, dynamic-import, Worker,
 * srcset and event-handler bypasses the old regex missed.
 */
import { parseFragment } from 'parse5';

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

/** External-resource policy by ad network (fail-closed for unknown networks). */
type ExternalPolicy = 'allowed' | 'google_allowlist' | 'forbidden';
const NETWORK_POLICY: Record<string, ExternalPolicy> = {
  google_ads: 'google_allowlist',
  tiktok: 'forbidden',
  amazon_dsp: 'forbidden',
  meta: 'forbidden',
  direct_publisher: 'allowed',
  hosted: 'allowed',
};
/** Hosts Google's uploaded-HTML5 spec permits (Google Fonts + Google-hosted libs). */
const GOOGLE_ALLOWLIST = ['fonts.googleapis.com', 'fonts.gstatic.com', 'ajax.googleapis.com', 'www.gstatic.com'];

function policyFor(network: string): ExternalPolicy {
  return NETWORK_POLICY[network] ?? 'forbidden';
}

export function isAllowedTemplate(template: string): boolean {
  return ALLOWED_TEMPLATES.includes(template);
}

// ---------------- minimal parse5 tree typing ----------------
interface P5Attr {
  name: string;
  value: string;
}
interface P5Node {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: P5Attr[];
  childNodes?: P5Node[];
}

const URL_ATTRS = new Set([
  'src', 'href', 'xlink:href', 'poster', 'data', 'background', 'formaction', 'action', 'cite', 'manifest', 'codebase',
]);

type UrlKind = 'relative' | 'local' | 'external' | 'javascript';
function classifyUrl(raw: string): UrlKind {
  const s = raw.trim();
  if (!s || s.startsWith('#')) return 'relative';
  if (/^(?:data|blob):/i.test(s)) return 'local';
  if (/^javascript:/i.test(s)) return 'javascript';
  if (/^\/\//.test(s)) return 'external'; // protocol-relative
  if (/^https?:\/\//i.test(s) || /^wss?:\/\//i.test(s) || /^ftp:\/\//i.test(s)) return 'external';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return 'external'; // any other explicit scheme
  return 'relative';
}
function hostOf(raw: string): string {
  try {
    return new URL(raw.startsWith('//') ? `https:${raw}` : raw).host.toLowerCase();
  } catch {
    return '';
  }
}

// JS pattern groups (run over inline <script> text + on* handler values).
const RE_NETWORK =
  /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|navigator\s*\.\s*sendBeacon|\bimportScripts\s*\(|\bimport\s*\(|new\s+Worker\b|new\s+SharedWorker\b|navigator\s*\.\s*serviceWorker/i;
const RE_DEVICE =
  /getUserMedia|navigator\s*\.\s*mediaDevices|navigator\s*\.\s*geolocation|navigator\s*\.\s*bluetooth|navigator\s*\.\s*usb/i;
const RE_UNSAFE =
  /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(\s*["'`]|document\s*\.\s*write(?:ln)?\s*\(|\.innerHTML\s*=|insertAdjacentHTML|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/i;

// Secret patterns (master rule 4: no secrets in creative bundles).
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['private_key', /-----BEGIN(?:[A-Z ]+)?PRIVATE KEY-----/],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/],
  ['openai_key', /\bsk-[A-Za-z0-9]{20,}\b/],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['github_token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['bearer_token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/],
  [
    'named_secret',
    /(?:api[_-]?key|secret|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]\s*["'][^"']{12,}["']/i,
  ],
];

interface Collected {
  urls: string[]; // resource URLs from attributes
  js: string[]; // inline script text + event-handler values
  css: string[]; // <style> text + style="" attributes
}

function collect(nodes: P5Node[] | undefined, acc: Collected): void {
  if (!nodes) return;
  for (const node of nodes) {
    const tag = node.tagName?.toLowerCase();
    if (tag && node.attrs) {
      for (const attr of node.attrs) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) acc.js.push(attr.value); // inline event handler = JS
        else if (name === 'style') acc.css.push(attr.value);
        else if (name === 'srcset') for (const part of attr.value.split(',')) acc.urls.push(part.trim().split(/\s+/)[0]);
        else if (URL_ATTRS.has(name)) acc.urls.push(attr.value);
      }
    }
    if (tag === 'script') {
      const hasSrc = node.attrs?.some((a) => a.name.toLowerCase() === 'src');
      if (!hasSrc) acc.js.push((node.childNodes ?? []).map((c) => c.value ?? '').join(''));
    } else if (tag === 'style') {
      acc.css.push((node.childNodes ?? []).map((c) => c.value ?? '').join(''));
    }
    collect(node.childNodes, acc);
  }
}

function extractCssUrls(css: string): string[] {
  const out: string[] = [];
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(css))) out.push(m[1]);
  const importRe = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gi;
  while ((m = importRe.exec(css))) out.push(m[1]);
  return out;
}

export function analyzeHtml5(html: string, opts: { network: string; maxBytes?: number }): Html5Analysis {
  const issues: Html5Issue[] = [];
  const add = (code: string, message: string) => {
    if (!issues.some((i) => i.code === code)) issues.push({ code, message });
  };

  const sizeBytes = Buffer.byteLength(html, 'utf8');
  const maxBytes = opts.maxBytes ?? (opts.network === 'google_ads' ? 600_000 : 5_000_000);
  if (sizeBytes > maxBytes) add('oversize', `bundle ${sizeBytes} exceeds ${maxBytes} bytes`);

  const policy = policyFor(opts.network);
  const acc: Collected = { urls: [], js: [], css: [] };
  collect((parseFragment(html) as unknown as { childNodes: P5Node[] }).childNodes, acc);
  for (const css of acc.css) acc.urls.push(...extractCssUrls(css));

  // 1) External resource references
  const flagExternal = (url: string) => {
    const kind = classifyUrl(url);
    if (kind === 'javascript') {
      add('unsafe_js', 'javascript: URLs are not allowed');
      return;
    }
    if (kind !== 'external') return;
    if (policy === 'allowed') return;
    if (policy === 'google_allowlist' && GOOGLE_ALLOWLIST.includes(hostOf(url))) return;
    add('external_request', `external resource is prohibited for ${opts.network}: ${url.slice(0, 80)}`);
  };
  for (const url of acc.urls) flagExternal(url);

  // 2) JS behavior. Scan the full source (superset of inline <script> text +
  // on* handlers in `acc.js`) so behavior in concatenated standalone .js/.css
  // files — not just inline <script> elements — is covered too.
  const jsBlob = `${html}\n${acc.js.join('\n')}`;
  // Forbidden networks (TikTok/Meta/Amazon playables) must be fully self-contained —
  // no fetch/XHR/WebSocket at all. google_ads serves the bundle and its runtime may
  // legitimately request its own inlined manifest, so JS network APIs are not flagged
  // there; external *resource* references are still caught by the AST/CSS checks above.
  if (RE_NETWORK.test(jsBlob) && policy === 'forbidden') {
    add('external_request', `network calls are prohibited for ${opts.network} (self-contained bundle required)`);
  }
  if (RE_DEVICE.test(jsBlob)) add('device_api', 'device APIs (camera/mic/geolocation) are prohibited');
  if (RE_UNSAFE.test(jsBlob)) add('unsafe_js', 'eval / Function / document.write / innerHTML / string timers are not allowed');

  // 3) Secret scan over the whole source
  for (const [code, re] of SECRET_PATTERNS) {
    if (re.test(html)) {
      add('secret', `possible secret in bundle (${code})`);
      break;
    }
  }

  return { ok: issues.length === 0, issues, sizeBytes };
}

/**
 * CSP for the isolated preview iframe. `script-src`/`style-src` keep `'unsafe-inline'`
 * because the vetted creative renders its own inline assets, but every network,
 * embedding, and navigation vector is explicitly denied as defense-in-depth even if
 * the analyzer missed something.
 */
export function buildPreviewCsp(): string {
  return [
    "default-src 'none'",
    'img-src data:',
    'media-src data:',
    'font-src data:',
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** Sandbox attributes for the preview iframe (scripts only; no same-origin, no nav). */
export const PREVIEW_SANDBOX = 'allow-scripts';
